"use client";

import { useState } from "react";
import type { ImportSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
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
