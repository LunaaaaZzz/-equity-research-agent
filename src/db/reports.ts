import { pool } from './client.js'
import type { PipelineResult } from '../orchestrator.js'

/**
 * Persists a pipeline result. entry_price is always the latest close at the
 * moment of analysis (entry_price_date is that trading day), so every report
 * can later be graded forward in time by `npm run backtest:evaluate`.
 */
export async function saveReport(runId: string, { report, snapshot }: PipelineResult): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO reports
       (run_id, ticker, company_name, analysis_date, recommendation,
        target_price, risk_score, metrics, summary, risk_flags,
        entry_price, entry_price_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      runId,
      report.ticker,
      report.companyName,
      report.analysisDate,
      report.recommendation,
      report.targetPrice,
      report.riskScore,
      JSON.stringify(report.metrics),
      report.summary,
      report.riskFlags,
      snapshot.price,
      snapshot.priceDate,
    ],
  )
  return rows[0].id
}
