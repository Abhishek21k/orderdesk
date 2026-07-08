import { pool } from "@/lib/db";
import { STATUSES, type Status } from "@/lib/money";
import type { OrderRow } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const status = (body as { status?: unknown })?.status;
  if (
    typeof status !== "string" ||
    !(STATUSES as readonly string[]).includes(status)
  ) {
    return Response.json(
      { error: `status must be one of: ${STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Update the order and record a change_log entry in a single transaction.
  // The change_log insert is what drives live sync in other windows.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const res = await client.query<OrderRow>(
      `UPDATE orders
         SET status = $1, updated_at = now()
       WHERE order_id = $2
       RETURNING order_id, customer_name, customer_email,
                 to_char(order_date, 'YYYY-MM-DD') AS order_date,
                 updated_at, status, currency, amount_cents, amount_usd_cents`,
      [status as Status, id]
    );

    if (res.rowCount === 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "order not found" }, { status: 404 });
    }

    await client.query("INSERT INTO change_log(order_id) VALUES($1)", [id]);
    await client.query("COMMIT");

    return Response.json(res.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    return Response.json(
      { error: err instanceof Error ? err.message : "update failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
