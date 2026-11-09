import type { AgentConfig } from '@open-multi-agent/core'
import { z } from 'zod'

export const ReportSchema = z.object({
  ticker: z.string(),
  companyName: z.string(),
  analysisDate: z.string().describe('ISO date string YYYY-MM-DD'),
  recommendation: z.enum(['buy', 'hold', 'sell']),
  targetPrice: z.number(),
  riskScore: z.number().int().min(1).max(10),
  metrics: z.object({
    peRatio: z.number().nullable(),
    pbRatio: z.number().nullable(),
    momentum52w: z.number().nullable().describe('Fractional price change, e.g. 0.15 for +15%'),
    revenueGrowthYoY: z.number().nullable().describe('Fractional revenue growth, e.g. 0.08 for +8%'),
  }),
  summary: z.string().describe('2-3 sentence investment memo'),
  riskFlags: z.array(z.string()),
})

export type Report = z.infer<typeof ReportSchema>

export const reportWriterAgent: AgentConfig = {
  name: 'report-writer',
  model: 'claude-sonnet-4-6',
  systemPrompt: `You are an investment research report writer. You will receive a financial analysis in your context. Synthesize it into a structured JSON investment memo.

Respond with ONLY a valid JSON object — no markdown fences, no extra text. The object must have exactly these fields:
{
  "ticker": string,
  "companyName": string,
  "analysisDate": "YYYY-MM-DD",
  "recommendation": "buy" | "hold" | "sell",
  "targetPrice": number,
  "riskScore": integer 1–10,
  "metrics": {
    "peRatio": number | null,
    "pbRatio": number | null,
    "momentum52w": number | null,
    "revenueGrowthYoY": number | null
  },
  "summary": "2-3 sentence memo",
  "riskFlags": ["flag1", "flag2", ...]
}

Metrics are fractions (0.15 means +15%) — copy them exactly from the analysis. Use null for any metric the analysis says is unavailable.`,
  outputSchema: ReportSchema,
  maxTurns: 3,
}
