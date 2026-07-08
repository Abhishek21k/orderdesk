"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/money";
import type { DashboardData } from "@/lib/types";
import { useLiveSync } from "@/lib/useLiveSync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EMPTY: DashboardData = {
  totalRevenueCents: 0,
  orderCount: 0,
  byMonth: [],
  top5: [],
};

export default function DashboardPage() {
  const version = useLiveSync();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: DashboardData = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  const chartData = data.byMonth.map((m) => ({
    month: m.month,
    revenue: m.revenueCents / 100,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {error && (
        <p className="text-sm text-destructive">
          Failed to load dashboard: {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {formatUsd(data.totalRevenueCents)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Order Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {data.orderCount.toLocaleString("en-US")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Revenue by Month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No revenue yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 16, bottom: 8, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    stroke="var(--muted-foreground)"
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(v: number) =>
                      v.toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      })
                    }
                  />
                  <Tooltip
                    formatter={(v) =>
                      Number(v).toLocaleString("en-US", {
                        style: "currency",
                        currency: "USD",
                      })
                    }
                    contentStyle={{
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-md)",
                    }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="var(--chart-1)"
                    name="Revenue"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">
            Top 5 Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.top5.length === 0 ? (
            <p className="text-sm text-muted-foreground">No customers yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Lifetime Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top5.map((c, i) => (
                  <TableRow key={c.email}>
                    <TableCell className="text-muted-foreground">
                      {i + 1}
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.email}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(c.lifetimeCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
