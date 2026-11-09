import { Router } from 'express'
import type { Request, Response } from 'express'
import { pool } from '../db/client.js'
import { saveReport } from '../db/reports.js'
import { runAnalysisPipeline } from '../orchestrator.js'
import { asyncHandler } from './async-handler.js'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/

router.post('/analyze', asyncHandler(async (req: Request, res: Response) => {
  const { ticker } = (req.body ?? {}) as { ticker?: unknown }
  const t = typeof ticker === 'string' ? ticker.trim().toUpperCase() : ''
  if (!TICKER_RE.test(t)) {
    res.status(400).json({ error: 'ticker is required and must be a valid symbol, e.g. "AAPL"' })
    return
  }

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO analysis_runs (ticker, status) VALUES ($1, 'pending') RETURNING id`,
    [t],
  )
  const runId = rows[0].id

  // Fire-and-forget: runPipelineAsync handles and records its own failures.
  void runPipelineAsync(runId, t)

  res.status(202).json({ runId, ticker: t, status: 'pending' })
}))

async function runPipelineAsync(runId: string, ticker: string): Promise<void> {
  try {
    await pool.query(`UPDATE analysis_runs SET status = 'running' WHERE id = $1`, [runId])

    const result = await runAnalysisPipeline(ticker)
    if (!result) {
      console.error(`Pipeline for run ${runId} (${ticker}) produced no valid report`)
      await pool.query(`UPDATE analysis_runs SET status = 'failed' WHERE id = $1`, [runId])
      return
    }

    await saveReport(runId, result)
    await pool.query(`UPDATE analysis_runs SET status = 'completed' WHERE id = $1`, [runId])
  } catch (err) {
    console.error(`Pipeline failed for run ${runId} (${ticker}):`, (err as Error).message)
    await pool.query(`UPDATE analysis_runs SET status = 'failed' WHERE id = $1`, [runId]).catch(() => {})
  }
}

router.get('/reports/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params
  if (!UUID_RE.test(id)) {
    res.status(400).json({ error: 'id must be a UUID' })
    return
  }

  const runResult = await pool.query<{ id: string; ticker: string; status: string; created_at: Date }>(
    `SELECT id, ticker, status, created_at FROM analysis_runs WHERE id = $1`,
    [id],
  )
  if (runResult.rows.length === 0) {
    res.status(404).json({ error: 'Run not found' })
    return
  }

  const run = runResult.rows[0]
  if (run.status !== 'completed') {
    res.json({ runId: id, ticker: run.ticker, status: run.status, createdAt: run.created_at })
    return
  }

  const reportResult = await pool.query(`SELECT * FROM reports WHERE run_id = $1`, [id])
  if (reportResult.rows.length === 0) {
    res.status(404).json({ error: 'Report not found' })
    return
  }

  res.json(reportResult.rows[0])
}))

// GET /reports?ticker=AAPL&limit=50&offset=0
router.get('/reports', asyncHandler(async (req: Request, res: Response) => {
  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.trim().toUpperCase() : null
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 200)
  const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0)

  const { rows } = await pool.query(
    `SELECT r.*, ar.status AS run_status
       FROM reports r
       JOIN analysis_runs ar ON r.run_id = ar.id
      WHERE ($1::text IS NULL OR r.ticker = $1)
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3`,
    [ticker, limit, offset],
  )
  res.json({ limit, offset, results: rows })
}))

export default router
