import { Router } from 'express'
import type { Request, Response } from 'express'
import { pool } from '../db/client.js'
import { asyncHandler } from './async-handler.js'

const router = Router()

// GET /backtest/summary — overall hit rate + breakdown by recommendation
router.get('/backtest/summary', asyncHandler(async (_req: Request, res: Response) => {
  const { rows } = await pool.query<{
    outcome: string
    recommendation: string
    count: string
  }>(`
    SELECT outcome, recommendation, COUNT(*)::text AS count
    FROM backtest_outcomes
    GROUP BY outcome, recommendation
    ORDER BY recommendation, outcome
  `)

  const byRec: Record<string, { n: number; correct: number }> = {}
  let totalN = 0
  let totalCorrect = 0

  for (const row of rows) {
    const n = parseInt(row.count, 10)
    if (!byRec[row.recommendation]) byRec[row.recommendation] = { n: 0, correct: 0 }
    byRec[row.recommendation].n += n
    totalN += n
    if (row.outcome === 'correct') {
      byRec[row.recommendation].correct += n
      totalCorrect += n
    }
  }

  res.json({
    n: totalN,
    hitRate: totalN > 0 ? parseFloat((totalCorrect / totalN).toFixed(4)) : null,
    byRecommendation: byRec,
  })
}))

// GET /backtest/results — full list of individual backtest outcomes
router.get('/backtest/results', asyncHandler(async (_req: Request, res: Response) => {
  const { rows } = await pool.query(`
    SELECT
      b.id, b.ticker, b.recommendation,
      b.entry_date, b.exit_date, b.entry_price, b.exit_price, b.price_change, b.outcome, b.evaluated_at,
      r.summary, r.target_price, r.risk_score, r.analysis_date
    FROM backtest_outcomes b
    JOIN reports r ON b.report_id = r.id
    ORDER BY b.evaluated_at DESC
  `)
  res.json(rows)
}))

export default router
