export interface AnalysisRun {
  id: string
  ticker: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  created_at: Date
}

export interface ReportRow {
  id: string
  run_id: string
  ticker: string
  company_name: string | null
  analysis_date: string | null
  recommendation: string
  target_price: number | null
  risk_score: number | null
  metrics: {
    peRatio: number | null
    pbRatio: number | null
    momentum52w: number | null
    revenueGrowthYoY: number | null
  } | null
  summary: string | null
  risk_flags: string[] | null
  entry_price: number | null
  entry_price_date: string | null
  created_at: Date
}

export interface BacktestOutcome {
  id: string
  report_id: string
  ticker: string
  recommendation: string
  entry_price: number
  exit_price: number
  price_change: number
  entry_date: string | null
  exit_date: string | null
  outcome: 'correct' | 'incorrect' | 'neutral'
  evaluated_at: Date
}
