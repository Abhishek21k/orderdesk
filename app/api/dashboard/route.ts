import { query } from "@/lib/db";
import type { DashboardData } from "@/lib/types";

// Route handlers are not cached by default; this must run per-request so live
// updates (driven by change_log) are reflected. Keep it explicitly dynamic.
export const dynamic = "force-dynamic";

// pg returns bigint SUM() and COUNT() as strings; parse them defensively.
function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
  const [revenueRes, countRes, byMonthRes, top5Res] = await Promise.all([
    query<{ total: string }>(
      `SELECT COALESCE(SUM(GREATEST(amount_usd_cents, 0)), 0) AS total
         FROM orders
        WHERE status IN ('completed', 'shipped')`
    ),
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM orders`),
    query<{ month: string; revenue: string }>(
      `SELECT to_char(date_trunc('month', order_date), 'YYYY-MM') AS month,
              COALESCE(SUM(GREATEST(amount_usd_cents, 0)), 0) AS revenue
         FROM orders
        WHERE status IN ('completed', 'shipped')
        GROUP BY 1
        ORDER BY 1`
    ),
    query<{ email: string; name: string; lifetime: string }>(
      `SELECT o.email_norm AS email,
              (SELECT customer_name
                 FROM orders n
                WHERE n.email_norm = o.email_norm
                ORDER BY n.updated_at DESC
                LIMIT 1) AS name,
              COALESCE(SUM(GREATEST(o.amount_usd_cents, 0)), 0) AS lifetime
         FROM orders o
        WHERE o.status IN ('completed', 'shipped')
        GROUP BY o.email_norm
        ORDER BY lifetime DESC
        LIMIT 5`
    ),
  ]);

  const data: DashboardData = {
    totalRevenueCents: toNum(revenueRes.rows[0]?.total),
    orderCount: toNum(countRes.rows[0]?.count),
    byMonth: byMonthRes.rows.map((r) => ({
      month: r.month,
      revenueCents: toNum(r.revenue),
    })),
    top5: top5Res.rows.map((r) => ({
      email: r.email,
      name: r.name,
      lifetimeCents: toNum(r.lifetime),
    })),
  };

  return Response.json(data);
}
