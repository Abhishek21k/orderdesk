import { type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { STATUSES, type Status } from "@/lib/money";
import type { OrderRow, OrdersResponse } from "@/lib/types";

// Whitelist for sortBy — never interpolate raw user input into SQL.
const SORT_COLUMNS = ["order_date", "amount_usd_cents", "updated_at"] as const;
type SortColumn = (typeof SORT_COLUMNS)[number];

export async function GET(request: NextRequest): Promise<Response> {
  const sp = request.nextUrl.searchParams;

  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(
    1,
    Math.min(200, parseInt(sp.get("pageSize") ?? "25", 10) || 25)
  );
  const search = (sp.get("search") ?? "").trim();
  const statusParam = sp.get("status") ?? "";

  const sortByRaw = sp.get("sortBy") ?? "order_date";
  const sortBy: SortColumn = SORT_COLUMNS.includes(sortByRaw as SortColumn)
    ? (sortByRaw as SortColumn)
    : "order_date";

  const dir: "ASC" | "DESC" =
    (sp.get("dir") ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  // Build WHERE clause with parameterized values only.
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (search) {
    // customer_name matched case-insensitively via ILIKE; email_norm is the
    // pre-lowercased email column, so we match it against the lowercased term.
    // Do NOT strip Unicode — pass the term through verbatim (accents intact).
    params.push(search);
    const nameIdx = params.length;
    params.push(search.toLowerCase());
    const emailIdx = params.length;
    conditions.push(
      `(customer_name ILIKE '%'||$${nameIdx}||'%' OR email_norm ILIKE '%'||$${emailIdx}||'%')`
    );
  }

  if (statusParam && (STATUSES as readonly string[]).includes(statusParam)) {
    params.push(statusParam as Status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // Full filtered count (independent of pagination).
  const countSql = `SELECT COUNT(*)::int AS total FROM orders ${whereClause}`;
  const countRes = await query<{ total: number }>(countSql, params);
  const total = countRes.rows[0]?.total ?? 0;

  // Paginated rows. sortBy/dir are whitelisted literals, not parameters.
  const offset = (page - 1) * pageSize;
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  const rowsSql = `
    SELECT order_id, customer_name, customer_email,
           to_char(order_date, 'YYYY-MM-DD') AS order_date, updated_at,
           status, currency, amount_cents, amount_usd_cents
    FROM orders
    ${whereClause}
    ORDER BY ${sortBy} ${dir}, order_id ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;
  const rowsRes = await query<OrderRow>(rowsSql, [...params, pageSize, offset]);

  const body: OrdersResponse = {
    rows: rowsRes.rows,
    total,
    page,
    pageSize,
  };

  return Response.json(body);
}
