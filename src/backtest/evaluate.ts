// Step 2 of the forward-looking backtest: grade every stored report that is at
// least HORIZON_DAYS old and not yet graded, by comparing its entry price
// (recorded at analysis time) with the close HORIZON_DAYS later.
//
// Because the recommendation was made before the exit price existed, there is
// no look-ahead bias. Safe to run repeatedly (e.g. daily); each report is graded once.
//
//   npm run backtest:evaluate
import 'dotenv/config'
import { pool } from '../db/client.js'
import { getDailyClosePrices, getPriceOnOrBefore } from '../tools/get-historical-price.js'
import { HOLD_BAND, HORIZON_DAYS, addDays, classifyOutcome, sleep } from './common.js'

// 1 Alpha Vantage call per ticker (TIME_SERIES_DAILY, last ~100 trading days).
const DELAY_MS = 15_000

interface PendingReport {
  id: string
  ticker: string
  recommendation: string
  entry_price: string // NUMERIC comes back from pg as a string
  entry_price_date: string
}

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)

  const { rows: pending } = await pool.query<PendingReport>(
    `SELECT r.id, r.ticker, r.recommendation, r.entry_price,
            to_char(COALESCE(r.entry_price_date, r.analysis_date), 'YYYY-MM-DD') AS entry_price_date
       FROM reports r
       LEFT JOIN backtest_outcomes b ON b.report_id = r.id
      WHERE b.id IS NULL
        AND r.entry_price IS NOT NULL
        AND COALESCE(r.entry_price_date, r.analysis_date) <= $1::date - $2::int
      ORDER BY r.ticker, r.created_at`,
    [today, HORIZON_DAYS],
  )

  console.log(`Horizon: ${HORIZON_DAYS} days   Hold band: ±${(HOLD_BAND * 100).toFixed(0)}%`)
  console.log(`${pending.length} report(s) ready to grade.\n`)

  // Group by ticker so each ticker's price series is fetched once.
  const byTicker = new Map<string, PendingReport[]>()
  for (const r of pending) byTicker.set(r.ticker, [...(byTicker.get(r.ticker) ?? []), r])

  let graded = 0
  let i = 0
  for (const [ticker, reports] of byTicker) {
    try {
      const prices = await getDailyClosePrices(ticker)
      for (const r of reports) {
        const entryPrice = parseFloat(r.entry_price)
        const exit = getPriceOnOrBefore(prices, addDays(r.entry_price_date, HORIZON_DAYS))
        const change = (exit.price - entryPrice) / entryPrice
        const outcome = classifyOutcome(r.recommendation, change)

        await pool.query(
          `INSERT INTO backtest_outcomes
             (report_id, ticker, recommendation, entry_date, exit_date,
              entry_price, exit_price, price_change, outcome)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (report_id) DO NOTHING`,
          [r.id, ticker, r.recommendation, r.entry_price_date, exit.date,
           entryPrice, exit.price, change, outcome],
        )
        graded++

        const sign = change >= 0 ? '+' : ''
        console.log(
          `[${ticker}] ${r.entry_price_date} → ${exit.date}  ${r.recommendation.padEnd(4)} ` +
          `${sign}${(change * 100).toFixed(1)}%  → ${outcome}`,
        )
      }
    } catch (err) {
      // Most likely: report is older than the ~100-trading-day series, or a rate limit.
      console.log(`[${ticker}] skipped ${reports.length} report(s): ${(err as Error).message}`)
    }
    if (++i < byTicker.size) await sleep(DELAY_MS)
  }

  console.log(`\nGraded ${graded} report(s). See GET /backtest/summary for the running hit rate.`)
  await pool.end()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
