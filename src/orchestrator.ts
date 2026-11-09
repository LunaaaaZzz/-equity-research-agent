import 'dotenv/config'
import { OpenMultiAgent } from '@open-multi-agent/core'
import type { OrchestratorEvent } from '@open-multi-agent/core'
import { dataFetcherAgent } from './agents/data-fetcher.js'
import { analystAgent } from './agents/analyst.js'
import { reportWriterAgent } from './agents/report-writer.js'
import type { Report } from './agents/report-writer.js'
import { getMarketSnapshot } from './tools/alpha-vantage.js'
import type { MarketSnapshot } from './tools/alpha-vantage.js'

export interface PipelineResult {
  report: Report
  /** Market data the report was based on; snapshot.price is the entry price for backtesting. */
  snapshot: MarketSnapshot
}

const orchestrator = new OpenMultiAgent({
  defaultModel: 'claude-sonnet-4-6',
  onProgress: (event: OrchestratorEvent) => {
    const ts = new Date().toISOString().slice(11, 19)
    if (event.type === 'task_start')    console.log(`[${ts}] task_start:    ${event.task}`)
    if (event.type === 'task_complete') console.log(`[${ts}] task_complete: ${event.task}`)
    if (event.type === 'agent_start')   console.log(`[${ts}] agent_start:   ${event.agent}`)
    if (event.type === 'agent_complete')console.log(`[${ts}] agent_done:    ${event.agent}`)
    if (event.type === 'error')         console.error(`[${ts}] error:         agent=${event.agent} task=${event.task}`)
  },
})

const team = orchestrator.createTeam('equity-team', {
  name: 'equity-team',
  agents: [dataFetcherAgent, analystAgent, reportWriterAgent],
})

/**
 * Runs the 3-agent pipeline for a ticker.
 * Throws if market data can't be fetched (unknown ticker, rate limit, bad key);
 * returns null if the agents fail to produce a valid report.
 */
export async function runAnalysisPipeline(ticker: string): Promise<PipelineResult | null> {
  const t = ticker.toUpperCase()
  const today = new Date().toISOString().split('T')[0]

  // Pre-flight: fail fast before spending LLM tokens. The response is cached,
  // so the data-fetcher agent's tool call reuses it at no extra API cost.
  const snapshot = await getMarketSnapshot(t)

  const result = await orchestrator.runTasks(team, [
    {
      title: `Fetch data: ${t}`,
      description: `Use the fetch_financials tool to retrieve financial data for ticker ${t}. Return all the raw data exactly as received from the tool.`,
      assignee: 'data-fetcher',
    },
    {
      title: `Analyze: ${t}`,
      description: `Analyze the financial data for ${t} provided in the context above. Today's date is ${today}. Compute all metrics and risk flags, provide a buy/hold/sell signal, target price, and risk score.`,
      assignee: 'analyst',
      dependsOn: [`Fetch data: ${t}`],
    },
    {
      title: `Write report: ${t}`,
      description: `Using the analysis for ${t} provided in the context above, produce a structured JSON investment report. Today's date is ${today} — use it as the analysisDate.`,
      assignee: 'report-writer',
      dependsOn: [`Analyze: ${t}`],
    },
  ])

  if (!result.success) return null

  const reportResult = result.agentResults.get('report-writer')
  const structured = reportResult?.structured as Report | undefined
  if (!structured) return null

  // Factual fields come from code, not the LLM; it only owns the judgment calls
  // (recommendation, target price, risk score, summary, risk flags).
  const report: Report = {
    ...structured,
    ticker: t,
    companyName: snapshot.companyName,
    analysisDate: today,
    metrics: snapshot.metrics,
  }
  return { report, snapshot }
}
