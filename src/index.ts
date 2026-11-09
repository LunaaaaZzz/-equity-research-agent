import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import analyzeRouter from './routes/analyze.js'
import backtestRouter from './routes/backtest.js'

const app = express()
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/', analyzeRouter)
app.use('/', backtestRouter)

// Catches errors forwarded by asyncHandler and malformed JSON bodies.
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body must be valid JSON' })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

const PORT = parseInt(process.env.PORT ?? '3000', 10)
app.listen(PORT, () => {
  console.log(`Equity research agent running on http://localhost:${PORT}`)
})
