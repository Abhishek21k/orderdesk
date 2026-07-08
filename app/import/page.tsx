"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { ImportRunSummary, ImportSummary, RejectedRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function RejectedRowsTable({ rows }: { rows: RejectedRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">None.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Row #</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Order ID</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.rowIndex}>
            <TableCell className="text-muted-foreground">{r.rowIndex + 1}</TableCell>
            <TableCell>
              <Badge variant="destructive">{r.reason}</Badge>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {r.rawRow.order_id || "—"}
            </TableCell>
            <TableCell>{r.rawRow.customer_name || "—"}</TableCell>
            <TableCell>{r.rawRow.customer_email || "—"}</TableCell>
            <TableCell>{r.rawRow.order_date || "—"}</TableCell>
            <TableCell>{r.rawRow.amount || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ImportHistory({ refreshKey }: { refreshKey: number }) {
  const [runs, setRuns] = useState<ImportRunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [expandedRows, setExpandedRows] = useState<RejectedRow[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/import/runs", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setRuns(body.runs ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const toggleExpand = useCallback(
    async (runId: number) => {
      if (expanded === runId) {
        setExpanded(null);
        return;
      }
      setExpanded(runId);
      setExpandedLoading(true);
      try {
        const res = await fetch(`/api/import/runs/${runId}/rejected`, {
          cache: "no-store",
        });
        const body = await res.json();
        setExpandedRows(body.rejectedRows ?? []);
      } finally {
        setExpandedLoading(false);
      }
    },
    [expanded]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">
          Import History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>File</TableHead>
                <TableHead className="text-right">Read</TableHead>
                <TableHead className="text-right">Imported</TableHead>
                <TableHead className="text-right">Dupes</TableHead>
                <TableHead className="text-right">Rejected</TableHead>
                <TableHead>Reconciles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <Fragment key={run.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => run.rejected > 0 && toggleExpand(run.id)}
                  >
                    <TableCell>{formatTime(run.startedAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {run.sourceFilename ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {run.rowsRead}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {run.imported}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {run.duplicatesDropped}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {run.rejected > 0 ? (
                        <span className="underline decoration-dotted">
                          {run.rejected}
                        </span>
                      ) : (
                        run.rejected
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={run.reconciles ? "success" : "destructive"}>
                        {run.reconciles ? "yes" : "no"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {expanded === run.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/30">
                        {expandedLoading ? (
                          <p className="text-sm text-muted-foreground">Loading…</p>
                        ) : (
                          <RejectedRowsTable rows={expandedRows} />
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  async function runImport() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? `Import failed (HTTP ${res.status})`);
      } else {
        setSummary(body as ImportSummary);
        setHistoryKey((k) => k + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Order Import</h1>
        <p className="text-sm text-muted-foreground">
          Upload an orders CSV to validate, dedup, and load into Postgres.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-md file:border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
        />
        <Button onClick={runImport} disabled={loading || !file}>
          {loading ? "Importing…" : "Import"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}

      {summary && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Run #{summary.runId} · started {formatTime(summary.startedAt)} · finished{" "}
            {formatTime(summary.finishedAt)}
            {summary.sourceFilename ? ` · ${summary.sourceFilename}` : ""}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows read" value={summary.rowsRead} />
            <Stat label="Imported" value={summary.imported} />
            <Stat label="Duplicates dropped" value={summary.duplicatesDropped} />
            <Stat label="Rejected" value={summary.rejected} />
          </div>

          <p className="text-sm">
            Reconciles:{" "}
            <Badge variant={summary.reconciles ? "success" : "destructive"}>
              {summary.reconciles ? "yes" : "no"}
            </Badge>
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                Rejected by reason
              </CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(summary.rejectedByReason).length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <Table>
                  <TableBody>
                    {Object.entries(summary.rejectedByReason).map(([reason, count]) => (
                      <TableRow key={reason}>
                        <TableCell className="font-mono text-xs">{reason}</TableCell>
                        <TableCell className="text-right">{count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                Rejected rows
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RejectedRowsTable rows={summary.rejectedRows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-foreground">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">None.</p>
              ) : (
                <ul className="list-disc space-y-1.5 pl-5 text-sm">
                  {summary.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <ImportHistory refreshKey={historyKey} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="items-center py-4 text-center">
      <div className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}
