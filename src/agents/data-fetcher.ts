import type { AgentConfig } from '@open-multi-agent/core'
import { fetchFinancialsTool } from '../tools/fetch-financials.js'

export const dataFetcherAgent: AgentConfig = {
  name: 'data-fetcher',
  model: 'claude-sonnet-4-6',
  systemPrompt: `You are a financial data collector. Your only job is to call the fetch_financials tool for the given ticker and return all the raw data exactly as received. Do not analyze, summarize, or modify the data.`,
  customTools: [fetchFinancialsTool],
  maxTurns: 3,
}
