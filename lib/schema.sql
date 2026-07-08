-- One row per import run — the audit trail of when imports happened and how
-- they reconciled. Never wiped by re-import (unlike orders).
CREATE TABLE IF NOT EXISTS import_runs (
  id                  bigserial PRIMARY KEY,
  started_at          timestamptz NOT NULL,
  finished_at         timestamptz NOT NULL,
  source_filename     text,
  rows_read           integer NOT NULL,
  imported            integer NOT NULL,
  duplicates_dropped  integer NOT NULL,
  rejected            integer NOT NULL,
  rejected_by_reason  jsonb NOT NULL,
  reconciles          boolean NOT NULL
);

-- One row per rejected CSV row for a given run, so "what was rejected and
-- why" is answerable after the fact, not just as an in-memory count.
CREATE TABLE IF NOT EXISTS rejected_rows (
  id            bigserial PRIMARY KEY,
  import_run_id bigint NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  row_index     integer NOT NULL,
  reason        text NOT NULL,
  raw_row       jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rejected_rows_run ON rejected_rows (import_run_id);

CREATE TABLE IF NOT EXISTS orders (
  order_id         text PRIMARY KEY,
  customer_name    text NOT NULL,
  customer_email   text NOT NULL,
  email_norm       text NOT NULL,
  order_date       date NOT NULL,
  updated_at       timestamptz NOT NULL,
  status           text NOT NULL,
  currency         text NOT NULL,
  amount_cents     bigint NOT NULL,
  amount_usd_cents bigint NOT NULL,
  import_run_id    bigint REFERENCES import_runs(id),
  imported_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date);
CREATE INDEX IF NOT EXISTS idx_orders_amount_usd ON orders (amount_usd_cents);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_email_norm ON orders (email_norm);

CREATE TABLE IF NOT EXISTS change_log (
  id         bigserial PRIMARY KEY,
  order_id   text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
