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
  amount_usd_cents bigint NOT NULL
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
