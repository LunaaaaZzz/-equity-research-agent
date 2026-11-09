import 'dotenv/config'

const AV_BASE = 'https://www.alphavantage.co/query'

// Responses are cached briefly so the pipeline's pre-flight check, the agent's
// tool call, and the entry-price lookup share one set of API calls.
// The free tier is tightly rate-limited, so every saved call matters.
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; body: Record<string, unknown> }>()

/**
 * Calls Alpha Vantage and throws on any failure.
 *
 * Alpha Vantage returns HTTP 200 even for errors — rate limiting, bad keys and
 * unknown symbols come back as a JSON body with a "Note", "Information" or
 * "Error Message" field — so the body must be inspected, not just the status.
 */
export async function avFetch(params: Record<string, string>): Promise<Record<string, unknown>> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) throw new Error('ALPHA_VANTAGE_API_KEY is not set')

  const cacheKey = JSON.stringify(params)
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.body

  const url = new URL(AV_BASE)
  for (const [k, v] of Object.entries({ ...params, apikey: apiKey })) {
    url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Alpha Vantage responded with HTTP ${res.status}`)

  const body = (await res.json()) as Record<string, unknown>
  for (const key of ['Error Message', 'Note', 'Information']) {
    if (typeof body[key] === 'string') {
      throw new Error(`Alpha Vantage ${params.function} failed: ${body[key]}`)
    }
  }

  cache.set(cacheKey, { at: Date.now(), body })
  return body
}

/** Parses an Alpha Vantage numeric field; "None", "-", "" and NaN become null. */
function num(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : null
}

export interface MarketSnapshot {
  ticker: string
  companyName: string
  /** Latest close and the trading day it is from. */
  price: number
  priceDate: string
  /** Pre-computed so the LLM never has to do arithmetic. All growth figures are fractions (0.15 = +15%). */
  metrics: {
    peRatio: number | null
    pbRatio: number | null
    momentum52w: number | null
    revenueGrowthYoY: number | null
  }
  overview: Record<string, unknown>
}

/**
 * Fetches everything the pipeline needs in two API calls:
 * OVERVIEW (fundamentals) + TIME_SERIES_WEEKLY (latest price and the price ~52 weeks ago).
 * Throws if the ticker is unknown or the API refuses the request.
 */
export async function getMarketSnapshot(ticker: string): Promise<MarketSnapshot> {
  const symbol = ticker.toUpperCase()

  const overview = await avFetch({ function: 'OVERVIEW', symbol })
  if (!overview.Symbol) throw new Error(`No company data found for ticker "${symbol}"`)

  const weekly = await avFetch({ function: 'TIME_SERIES_WEEKLY', symbol })
  const series = weekly['Weekly Time Series'] as Record<string, Record<string, string>> | undefined
  if (!series) throw new Error(`No price history returned for ticker "${symbol}"`)

  const dates = Object.keys(series).sort().reverse() // newest first
  if (dates.length === 0) throw new Error(`Empty price history for ticker "${symbol}"`)

  const priceDate = dates[0]
  const price = parseFloat(series[priceDate]['4. close'])

  // Close from the week nearest to exactly one year before the latest close.
  const yearAgo = new Date(priceDate)
  yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1)
  const yearAgoDate = dates.find(d => d <= yearAgo.toISOString().slice(0, 10))
  const yearAgoPrice = yearAgoDate ? parseFloat(series[yearAgoDate]['4. close']) : null

  return {
    ticker: symbol,
    companyName: String(overview.Name ?? symbol),
    price,
    priceDate,
    metrics: {
      peRatio: num(overview.PERatio),
      pbRatio: num(overview.PriceToBookRatio),
      momentum52w: yearAgoPrice ? (price - yearAgoPrice) / yearAgoPrice : null,
      revenueGrowthYoY: num(overview.QuarterlyRevenueGrowthYOY),
    },
    overview,
  }
}
