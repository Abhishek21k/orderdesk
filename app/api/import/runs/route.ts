import { query } from "@/lib/db";
import type { ImportRunSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  started_at: string;
  finished_at: string;
  source_filename: string | null;
  rows_read: number;
  imported: number;
  duplicates_dropped: number;
  rejected: number;
  reconciles: boolean;
}

// Audit log: every import run ever executed, most recent first. Not affected
// by orders being wiped/reloaded on each import.
export async function GET(): Promise<Response> {
  const { rows } = await query<Row>(
    `SELECT id, started_at, finished_at, source_filename, rows_read,
            imported, duplicates_dropped, rejected, reconciles
     FROM import_runs
     ORDER BY started_at DESC
     LIMIT 50`
  );

  const runs: ImportRunSummary[] = rows.map((r) => ({
    id: Number(r.id),
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: new Date(r.finished_at).toISOString(),
    sourceFilename: r.source_filename,
    rowsRead: r.rows_read,
    imported: r.imported,
    duplicatesDropped: r.duplicates_dropped,
    rejected: r.rejected,
    reconciles: r.reconciles,
  }));

  return Response.json({ runs });
}
