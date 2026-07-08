import { parse } from "csv-parse/sync";
import { pool } from "./db";
import { parseDate, parseAmountCents } from "./parse";
import {
  SUPPORTED_CURRENCIES,
  toUsdCents,
  GBP_ASSUMED,
} from "./money";
import type { ImportSummary, RejectedRow } from "./types";

// Column order in orders.csv:
// order_id, customer_name, customer_email, order_date, updated_at, status, currency, amount
const EXPECTED_COLUMNS = 8;
const CSV_COLUMNS = [
  "order_id",
  "customer_name",
  "customer_email",
  "order_date",
  "updated_at",
  "status",
  "currency",
  "amount",
] as const;
const INSERT_BATCH = 500;

type RejectReason =
  | "wrong_column_count"
  | "missing_email"
  | "unparseable_date"
  | "empty_or_bad_amount"
  | "unsupported_currency";

interface ValidRow {
  order_id: string;
  customer_name: string;
  customer_email: string;
  email_norm: string;
  order_date: string; // YYYY-MM-DD
  updated_at: string; // raw ISO — Postgres parses to timestamptz
  updated_at_ms: number; // for dedup comparison
  status: string;
  currency: string;
  amount_cents: number;
  amount_usd_cents: number;
  fileIndex: number; // position among data rows, for tie-breaking
}

// Zips a raw CSV row against the expected column labels for display. Handles
// short/long/malformed rows without throwing.
function toRawRow(row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  CSV_COLUMNS.forEach((label, i) => {
    out[label] = row[i] ?? "";
  });
  if (row.length !== EXPECTED_COLUMNS) {
    out["_raw"] = row.join(",");
  }
  return out;
}

/**
 * Validate a single raw CSV data row. Returns either a ValidRow or a single
 * reject reason (first failure wins, in the required precedence). Never throws.
 */
function validateRow(row: string[], fileIndex: number): ValidRow | RejectReason {
  // 1. wrong_column_count
  if (row.length !== EXPECTED_COLUMNS) return "wrong_column_count";

  const [
    order_id,
    customer_name,
    customer_email,
    order_date_raw,
    updated_at_raw,
    status,
    currency_raw,
    amount_raw,
  ] = row;

  // 2. missing_email
  if (!customer_email || !customer_email.trim()) return "missing_email";

  // 3. unparseable_date (order_date OR updated_at)
  const order_date = parseDate(order_date_raw ?? "");
  if (order_date === null) return "unparseable_date";
  const updated_at = (updated_at_raw ?? "").trim();
  const updated_at_ms = new Date(updated_at).getTime();
  if (!updated_at || Number.isNaN(updated_at_ms)) return "unparseable_date";

  // 4. empty_or_bad_amount
  const amount_cents = parseAmountCents(amount_raw ?? "");
  if (amount_cents === null) return "empty_or_bad_amount";

  // 5. unsupported_currency
  const currency = (currency_raw ?? "").trim();
  if (!SUPPORTED_CURRENCIES.includes(currency)) return "unsupported_currency";

  const email_norm = customer_email.trim().toLowerCase();
  const amount_usd_cents = toUsdCents(amount_cents, currency);

  return {
    order_id: (order_id ?? "").trim(),
    customer_name: customer_name ?? "",
    customer_email: customer_email.trim(),
    email_norm,
    order_date,
    updated_at,
    updated_at_ms,
    status,
    currency,
    amount_cents,
    amount_usd_cents,
    fileIndex,
  };
}

export async function runImport(
  content: Buffer,
  sourceFilename: string | null = null
): Promise<ImportSummary> {
  const startedAt = new Date();

  // Array mode so we can count fields per row. bom strips the UTF-8 BOM,
  // relax_column_count keeps short/long rows instead of throwing.
  const records: string[][] = parse(content, {
    bom: true,
    relax_column_count: true,
    skip_empty_lines: true,
  });

  // First record is the header row; every other record is a data row.
  const dataRows = records.length > 0 ? records.slice(1) : [];
  const rowsRead = dataRows.length;

  const rejectedByReason: Record<string, number> = {};
  const rejectedRows: RejectedRow[] = [];
  const validRows: ValidRow[] = [];

  dataRows.forEach((row, i) => {
    try {
      const result = validateRow(row, i);
      if (typeof result === "string") {
        rejectedByReason[result] = (rejectedByReason[result] ?? 0) + 1;
        rejectedRows.push({ rowIndex: i, reason: result, rawRow: toRawRow(row) });
      } else {
        validRows.push(result);
      }
    } catch {
      // A single bad row must never crash the import. Bucket unexpected
      // failures with the amount reason as a defensive catch-all.
      const reason: RejectReason = "empty_or_bad_amount";
      rejectedByReason[reason] = (rejectedByReason[reason] ?? 0) + 1;
      rejectedRows.push({ rowIndex: i, reason, rawRow: toRawRow(row) });
    }
  });

  const rejected = Object.values(rejectedByReason).reduce((a, b) => a + b, 0);

  // DEDUP among VALID rows only: keep max updated_at per order_id; ties resolve
  // to the row appearing later in the file. Iterating in file order and
  // replacing on `>=` naturally makes the later row win ties.
  const winners = new Map<string, ValidRow>();
  for (const vr of validRows) {
    const existing = winners.get(vr.order_id);
    if (!existing || vr.updated_at_ms >= existing.updated_at_ms) {
      winners.set(vr.order_id, vr);
    }
  }
  const winnerRows = [...winners.values()];
  const duplicatesDropped = validRows.length - winnerRows.length;
  const imported = winnerRows.length;

  const reconciles = rowsRead === imported + duplicatesDropped + rejected;
  const finishedAt = new Date();

  const notes: string[] = [];
  if (GBP_ASSUMED) {
    notes.push(
      "GBP converted at assumed 1.27 USD — spec defines no GBP rate; flagged for stakeholder."
    );
  }
  if (!reconciles) {
    notes.push(
      `Reconciliation FAILED: rowsRead(${rowsRead}) !== imported(${imported}) + duplicatesDropped(${duplicatesDropped}) + rejected(${rejected}).`
    );
  }

  // Persist: record the run (audit trail — never wiped), the rejected rows
  // for that run, then wipe orders/change_log and bulk-insert the winners
  // tagged with this run's id, all inside one transaction.
  const client = await pool.connect();
  let runId: number;
  try {
    await client.query("BEGIN");

    const runResult = await client.query<{ id: number }>(
      `INSERT INTO import_runs
        (started_at, finished_at, source_filename, rows_read, imported,
         duplicates_dropped, rejected, rejected_by_reason, reconciles)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        startedAt.toISOString(),
        finishedAt.toISOString(),
        sourceFilename,
        rowsRead,
        imported,
        duplicatesDropped,
        rejected,
        JSON.stringify(rejectedByReason),
        reconciles,
      ]
    );
    runId = Number(runResult.rows[0].id);

    for (let start = 0; start < rejectedRows.length; start += INSERT_BATCH) {
      const batch = rejectedRows.slice(start, start + INSERT_BATCH);
      const values: unknown[] = [];
      const tuples: string[] = [];
      batch.forEach((r, idx) => {
        const b = idx * 4;
        tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
        values.push(runId, r.rowIndex, r.reason, JSON.stringify(r.rawRow));
      });
      await client.query(
        `INSERT INTO rejected_rows (import_run_id, row_index, reason, raw_row)
         VALUES ${tuples.join(",")}`,
        values
      );
    }

    await client.query("TRUNCATE orders");
    await client.query("TRUNCATE change_log RESTART IDENTITY");

    for (let start = 0; start < winnerRows.length; start += INSERT_BATCH) {
      const batch = winnerRows.slice(start, start + INSERT_BATCH);
      const values: unknown[] = [];
      const tuples: string[] = [];
      batch.forEach((r, idx) => {
        const b = idx * 11;
        tuples.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`
        );
        values.push(
          r.order_id,
          r.customer_name,
          r.customer_email,
          r.email_norm,
          r.order_date,
          r.updated_at,
          r.status,
          r.currency,
          r.amount_cents,
          r.amount_usd_cents,
          runId
        );
      });
      await client.query(
        `INSERT INTO orders
          (order_id, customer_name, customer_email, email_norm, order_date,
           updated_at, status, currency, amount_cents, amount_usd_cents, import_run_id)
         VALUES ${tuples.join(",")}`,
        values
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    runId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    sourceFilename,
    rowsRead,
    imported,
    duplicatesDropped,
    rejected,
    rejectedByReason,
    rejectedRows,
    reconciles,
    notes,
  };
}
