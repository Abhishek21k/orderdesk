import type { Status } from "./money";

// Shape returned by GET /api/orders rows.
export interface OrderRow {
  order_id: string;
  customer_name: string;
  customer_email: string;
  order_date: string; // YYYY-MM-DD
  updated_at: string; // ISO
  status: Status;
  currency: string;
  amount_cents: number;
  amount_usd_cents: number;
}

export interface OrdersResponse {
  rows: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ImportSummary {
  rowsRead: number;
  imported: number;
  duplicatesDropped: number;
  rejected: number;
  rejectedByReason: Record<string, number>;
  reconciles: boolean;
  notes: string[];
}

export interface DashboardData {
  totalRevenueCents: number;
  orderCount: number;
  byMonth: { month: string; revenueCents: number }[];
  top5: { email: string; name: string; lifetimeCents: number }[];
}
