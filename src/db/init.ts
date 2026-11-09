import { pool } from './client.js'

await pool.query(`
  CREATE TABLE IF NOT EXISTS analysis_runs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker     VARCHAR(10) NOT NULL,
    status     VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS reports (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id         UUID REFERENCES analysis_runs(id),
    ticker         VARCHAR(10) NOT NULL,
    company_name   VARCHAR(255),
    analysis_date  DATE,
    recommendation VARCHAR(10) NOT NULL,
    target_price   NUMERIC,
    risk_score     INTEGER,
    metrics        JSONB,
    summary        TEXT,
    risk_flags     TEXT[],
    created_at     TIMESTAMPTZ DEFAULT now()
  );
`)

console.log('Tables created.')
await pool.end()
