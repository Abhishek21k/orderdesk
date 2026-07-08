import { query } from "@/lib/db";
import type { RejectedRow } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row {
  row_index: number;
  reason: string;
  raw_row: Record<string, string>;
}

// Rejected rows for one past import run, keyed by run id from the audit log.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const runId = Number(id);
  if (!Number.isInteger(runId)) {
    return Response.json({ error: "invalid_run_id" }, { status: 400 });
  }

  const { rows } = await query<Row>(
    `SELECT row_index, reason, raw_row
     FROM rejected_rows
     WHERE import_run_id = $1
     ORDER BY row_index ASC`,
    [runId]
  );

  const rejectedRows: RejectedRow[] = rows.map((r) => ({
    rowIndex: r.row_index,
    reason: r.reason,
    rawRow: r.raw_row,
  }));

  return Response.json({ rejectedRows });
}
