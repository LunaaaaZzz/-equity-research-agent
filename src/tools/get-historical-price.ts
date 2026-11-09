import { avFetch } from './alpha-vantage.js'

// Fetches the last 100 trading days of daily closes for a ticker (1 API call).
// Returns a Map of date string (YYYY-MM-DD) → closing price.
export async function getDailyClosePrices(ticker: string): Promise<Map<string, number>> {
  const data = await avFetch({
    function: 'TIME_SERIES_DAILY',
    symbol: ticker.toUpperCase(),
    outputsize: 'compact',
  })

  const series = data['Time Series (Daily)'] as Record<string, Record<string, string>> | undefined
  if (!series) throw new Error(`No daily series returned for ${ticker}`)

  const map = new Map<string, number>()
  for (const [date, ohlcv] of Object.entries(series)) {
    map.set(date, parseFloat(ohlcv['4. close']))
  }
  return map
}

// Returns the close on the nearest trading day on or before `date` (YYYY-MM-DD).
// Throws if `date` is older than the oldest point in the series, rather than
// silently returning a price from the wrong day.
export function getPriceOnOrBefore(prices: Map<string, number>, date: string): { date: string; price: number } {
  const sorted = [...prices.keys()].sort()
  if (sorted.length === 0 || date < sorted[0]) {
    throw new Error(`No price data on or before ${date} (series starts ${sorted[0] ?? 'n/a'})`)
  }
  const match = sorted.reverse().find(d => d <= date)!
  return { date: match, price: prices.get(match)! }
}
