// Step 1 of the forward-looking backtest: run the pipeline today for a list of
// tickers and store each report with today's price as its entry price.
// Grade them once they are HORIZON_DAYS old with `npm run backtest:evaluate`.
//
//   npm run backtest:generate              # default ticker list
//   npm run backtest:generate -- AAPL MSFT # custom tickers
import 'dotenv/config'
import { pool } from '../db/client.js'
import { saveReport } from '../db/reports.js'
import { runAnalysisPipeline } from '../orchestrator.js'
import { HORIZON_DAYS, addDays, sleep } from './common.js'

const DEFAULT_TICKERS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'JPM', 'JNJ', 'META', 'NVDA', 'V']

// Each ticker costs 2 Alpha Vantage calls (OVERVIEW + TIME_SERIES_WEEKLY).
// Free tier: 5 calls/min and a small daily cap, so pace generously.
const DELAY_MS = 30_000

async function main(): Promise<void> {
  const args = process.argv.slice(2).map(t => t.toUpperCase())
  const tickers = args.length > 0 ? args : DEFAULT_TICKERS
  const today = new Date().toISOString().slice(0, 10)

  console.log(`Generating reports for: ${tickers.join(', ')}`)
  console.log(`Gradeable on or after ${addDays(today, HORIZON_DAYS)} via \`npm run backtest:evaluate\`.\n`)

  let saved = 0
  for (const [i, ticker] of tickers.entries()) {
    process.stdout.write(`[${ticker}] running pipeline ... `)
    try {
      const result = await runAnalysisPipeline(ticker)
      if (!result) {
        console.log('no valid report — skipped')
      } else {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO analysis_runs (ticker, status) VALUES ($1, 'completed') RETURNING id`,
          [ticker],
        )
        await saveReport(rows[0].id, result)
        saved++
        console.log(`${result.report.recommendation}  @ ${result.snapshot.price} (${result.snapshot.priceDate})`)
      }
    } catch (err) {
      console.log(`error: ${(err as Error).message}`)
    }
    if (i < tickers.length - 1) await sleep(DELAY_MS)
  }

  console.log(`\nSaved ${saved}/${tickers.length} reports.`)
  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
