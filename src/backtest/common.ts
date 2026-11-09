// Shared backtest settings.

/** Days between a report's analysis and the price it is graded against. */
export const HORIZON_DAYS = 30

/** A "hold" is correct if the price moved less than ±3% over the horizon. */
export const HOLD_BAND = 0.03

export type Outcome = 'correct' | 'incorrect' | 'neutral'

export function classifyOutcome(recommendation: string, priceChange: number): Outcome {
  if (recommendation === 'buy')  return priceChange > 0 ? 'correct' : 'incorrect'
  if (recommendation === 'sell') return priceChange < 0 ? 'correct' : 'incorrect'
  if (recommendation === 'hold') return Math.abs(priceChange) <= HOLD_BAND ? 'correct' : 'incorrect'
  return 'neutral'
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
