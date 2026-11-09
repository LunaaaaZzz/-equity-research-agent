import { defineTool } from '@open-multi-agent/core'
import { z } from 'zod'
import { getMarketSnapshot } from './alpha-vantage.js'

export const fetchFinancialsTool = defineTool({
  name: 'fetch_financials',
  description:
    'Fetch financial data for a stock ticker from Alpha Vantage. Returns the latest price, pre-computed key metrics ' +
    '(P/E, P/B, 52-week momentum, YoY revenue growth — growth figures are fractions, e.g. 0.15 = +15%), ' +
    'and the full company overview.',
  inputSchema: z.object({
    ticker: z.string().describe('Stock ticker symbol, e.g. AAPL'),
  }),
  execute: async ({ ticker }) => {
    try {
      const snapshot = await getMarketSnapshot(ticker)
      return { data: JSON.stringify(snapshot, null, 2) }
    } catch (err) {
      return { data: `Failed to fetch data: ${(err as Error).message}`, isError: true }
    }
  },
})
