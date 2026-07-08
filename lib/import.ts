import { parse } from "csv-parse/sync";
import { pool } from "./db";
import { parseDate, parseAmountCents } from "./parse";
import {
  SUPPORTED_CURRENCIES,
  toUsdCents,
  GBP_ASSUMED,
} from "./money";
import type { ImportSummary } from "./types";

// Column order in orders.csv:
// order_id, customer_name, customer_email, order_date, updated_at, status, currency, amount
const EXPECTED_COLUMNS = 8;
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

export async function runImport(content: Buffer): Promise<ImportSummary> {
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
  const validRows: ValidRow[] = [];

  dataRows.forEach((row, i) => {
    try {
      const result = validateRow(row, i);
      if (typeof result === "string") {
        rejectedByReason[result] = (rejectedByReason[result] ?? 0) + 1;
      } else {
        validRows.push(result);
      }
    } catch {
      // A single bad row must never crash the import. Bucket unexpected
      // failures with the amount reason as a defensive catch-all.
      rejectedByReason["empty_or_bad_amount"] =
        (rejectedByReason["empty_or_bad_amount"] ?? 0) + 1;
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

  // Persist: wipe both tables and bulk-insert winners inside one transaction.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE orders");
    await client.query("TRUNCATE change_log RESTART IDENTITY");

    for (let start = 0; start < winnerRows.length; start += INSERT_BATCH) {
      const batch = winnerRows.slice(start, start + INSERT_BATCH);
      const values: unknown[] = [];
      const tuples: string[] = [];
      batch.forEach((r, idx) => {
        const b = idx * 10;
        tuples.push(
          `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`
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
          r.amount_usd_cents
        );
      });
      await client.query(
        `INSERT INTO orders
          (order_id, customer_name, customer_email, email_norm, order_date,
           updated_at, status, currency, amount_cents, amount_usd_cents)
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

  const reconciles = rowsRead === imported + duplicatesDropped + rejected;

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

  return {
    rowsRead,
    imported,
    duplicatesDropped,
    rejected,
    rejectedByReason,
    reconciles,
    notes,
  };
}
