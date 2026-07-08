"use client";

import { useCallback, useEffect, useState } from "react";
import { STATUSES, type Status, formatUsd } from "@/lib/money";
import type { OrderRow, OrdersResponse } from "@/lib/types";
import { useLiveSync } from "@/lib/useLiveSync";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortColumn = "order_date" | "amount_usd_cents";
type Dir = "asc" | "desc";

const STATUS_VARIANT: Record<Status, "success" | "secondary" | "warning" | "destructive"> = {
  completed: "success",
  shipped: "success",
  pending: "warning",
  cancelled: "secondary",
  refunded: "destructive",
};

function formatOriginal(cents: number, currency: string): string {
  try {
    return (cents / 100).toLocaleString("en-US", { style: "currency", currency });
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string): string {
  return value ? value.slice(0, 10) : "";
}

export default function OrdersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | Status>("");
  const [sortBy, setSortBy] = useState<SortColumn>("order_date");
  const [dir, setDir] = useState<Dir>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [data, setData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveVersion = useLiveSync();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        dir,
      });
      if (search) qs.set("search", search);
      if (status) qs.set("status", status);

      const res = await fetch(`/api/orders?${qs.toString()}`);
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const json = (await res.json()) as OrdersResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, dir, search, status]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, liveVersion]);

  const toggleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setDir("desc");
    }
    setPage(1);
  };

  const sortArrow = (column: SortColumn) =>
    sortBy === column ? (dir === "asc" ? " ▲" : " ▼") : "";

  const updateStatus = async (orderId: string, newStatus: Status) => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error(`update failed (${res.status})`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.order_id === orderId ? { ...r, status: newStatus } : r
              ),
            }
          : prev
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update status");
      fetchOrders();
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows: OrderRow[] = data?.rows ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Orders</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search name or email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="max-w-xs"
        />

        <Select
          value={status || "all"}
          onValueChange={(v) => {
            setStatus(v === "all" ? "" : (v as Status));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {loading && <span className="text-sm text-muted-foreground">Loading…</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => toggleSort("order_date")}
              >
                Order Date{sortArrow("order_date")}
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => toggleSort("amount_usd_cents")}
              >
                USD Amount{sortArrow("amount_usd_cents")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.order_id}>
                  <TableCell className="font-mono text-xs">{r.order_id}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.customer_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.customer_email}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(r.order_date)}</TableCell>
                  <TableCell>
                    <Select
                      value={r.status}
                      onValueChange={(v) => updateStatus(r.order_id, v as Status)}
                    >
                      <SelectTrigger size="sm" className="w-32">
                        <SelectValue>
                          <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatOriginal(Number(r.amount_cents), r.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsd(Number(r.amount_usd_cents))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1 || loading}
        >
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages || loading}
        >
          Next
        </Button>
        <span className="text-sm text-muted-foreground">
          page {page} of {totalPages}, {total} total
        </span>
      </div>
    </div>
  );
}
