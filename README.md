# OrderDesk

Order management app: CSV import (with a persisted audit trail), a paginated/searchable/sortable
orders table with inline status edits, a revenue dashboard, and live sync across browser tabs via
ElectricSQL.

## Stack

- **Next.js 16** (App Router, TypeScript) — UI + API routes
- **Postgres 16** — persistent store
- **ElectricSQL** — change-notification channel for live sync (not a data path — the client still
  fetches paginated/aggregated data from the API, never the full table)
- **shadcn/ui + Tailwind v4** — components
- **Docker Compose** — postgres + electric + the Next.js app itself

## Run everything with one command

Two Compose files, same services (`postgres`, `electric`, `app`), different `app` build:

| File | `app` service | Use for |
|---|---|---|
| `docker-compose.yml` | built from `Dockerfile` (production build, `next start`) | prod-like run, demo |
| `docker-compose.dev.yml` | `node:22-alpine` + bind-mounted source + `npm run dev` (Turbopack, hot reload) | active development |

Only run one at a time — both publish the same host ports.

```bash
# production-like: builds the Next.js image, runs the full stack
docker compose up -d --build

# development: hot reload, source bind-mounted into the container
docker compose -f docker-compose.dev.yml up -d
```

Either way, once containers are healthy:

- App: http://localhost:3000
- Postgres: `localhost:54329` (user/pass/db: `orderdesk`)
- Electric HTTP API: http://localhost:30001

Bring a stack down:

```bash
docker compose down                          # prod stack (keeps the pg volume)
docker compose -f docker-compose.dev.yml down # dev stack (keeps its own pg volume)
```

Schema (`lib/schema.sql`) is applied automatically via Postgres's
`docker-entrypoint-initdb.d` the first time a fresh volume starts — nothing to run by hand.

## Local dev without Docker for the app

Run just the infra in Docker and `next dev` on the host (faster iteration, no container rebuilds):

```bash
docker compose up -d postgres electric   # infra only
npm install
npm run dev                               # http://localhost:3000
```

`.env.local` already points at the published host ports (`localhost:54329`, `localhost:30001`).

## Using it

1. Open **Import**, choose a CSV, click Import. Summary shows rows read / imported / duplicates
   dropped / rejected (by reason), plus the individual rejected rows and full import history —
   every past run is kept (never wiped by re-import), so you can always see what was
   imported/rejected and when.
2. **Orders** — server-side paginated table: search by name/email, filter by status, sort by date
   or USD amount, edit status inline.
3. **Dashboard** — total USD revenue, order count, revenue-by-month chart, top-5 customers by
   lifetime value.
4. Open two browser tabs side by side; a status edit in one reflects in the other's table and
   dashboard totals within ~2s (via the Electric change-log shape, no manual reload).

## CSV import rules

- Dates: ISO, US `MM/DD/YYYY`, or `DD Mon YYYY` — all normalized.
- Amounts: strips `$`/commas; converted to USD in integer cents, half-up rounding
  (EUR ×1.08 per spec; **GBP ×1.27 is an assumption** — the spec defines no GBP rate — flagged in
  the import notes).
- Refunded orders always contribute $0 revenue, regardless of sign.
- Duplicate `order_id`s: the row with the latest `updated_at` wins; ties go to the row appearing
  later in the file. Only valid rows are deduped — malformed rows are rejected outright.
- Rejection reasons (first match wins): wrong column count, missing email, unparseable date,
  empty/bad amount, unsupported currency.

## Verification

`scripts/verify_oracle.py` independently recomputes the import summary and dashboard totals
straight from the CSV (no shared code with the TypeScript importer) and can diff against the live
API:

```bash
python3 scripts/verify_oracle.py            # print expected numbers
python3 scripts/verify_oracle.py --api       # also fetch the running app's API and diff to the cent
```

## Project layout

- `lib/import.ts` — importer: parse, validate, dedup, persist, audit trail
- `lib/money.ts` / `lib/parse.ts` — currency/cents math and date/amount parsing
- `lib/schema.sql` — Postgres schema (orders, change_log, import_runs, rejected_rows)
- `lib/useLiveSync.ts` — Electric shape subscription → change-version hook
- `app/api/*` — orders, dashboard, import, import history routes
- `app/page.tsx`, `app/dashboard/page.tsx`, `app/import/page.tsx` — orders table, dashboard, import UI
