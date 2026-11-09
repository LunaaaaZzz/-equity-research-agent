import { pool } from './client.js'

await pool.query(`
  ALTER TABLE reports ADD COLUMN IF NOT EXISTS entry_price NUMERIC;
  ALTER TABLE reports ADD COLUMN IF NOT EXISTS entry_price_date DATE;

  CREATE TABLE IF NOT EXISTS backtest_outcomes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id      UUID REFERENCES reports(id),
    ticker         VARCHAR(10) NOT NULL,
    recommendation VARCHAR(10) NOT NULL,
    entry_price    NUMERIC NOT NULL,
    exit_price     NUMERIC NOT NULL,
    price_change   NUMERIC NOT NULL,
    outcome        VARCHAR(10) NOT NULL,
    evaluated_at   TIMESTAMPTZ DEFAULT now()
  );

  ALTER TABLE backtest_outcomes ADD COLUMN IF NOT EXISTS entry_date DATE;
  ALTER TABLE backtest_outcomes ADD COLUMN IF NOT EXISTS exit_date DATE;

  -- A report is graded exactly once.
  CREATE UNIQUE INDEX IF NOT EXISTS backtest_outcomes_report_id_key ON backtest_outcomes (report_id);
`)

console.log('Backtest migration complete.')
await pool.end()
