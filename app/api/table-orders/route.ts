import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { requireTableSession } from "@/lib/table-session";
import { loadOpenTables } from "@/lib/bill-query";

// Usato dalla pagina cliente per lo stato del proprio tavolo: richiede la
// sessione aperta col QR, altrimenti si leggerebbero gli ordini altrui.
export async function GET(req: Request) {
  const tenant = await getTenantFromHost();
  if (!tenant) return NextResponse.json({ orders: [] });

  const { searchParams } = new URL(req.url);
  const table = parseInt(searchParams.get("table") ?? "", 10);
  if (!Number.isInteger(table)) return NextResponse.json({ orders: [] });

  if (!(await requireTableSession(tenant.id, table)))
    return NextResponse.json({ orders: [], scaduta: true }, { status: 401 });

  const os = await db
    .select({
      id: orders.id,
      status: orders.status,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenant.id),
        eq(orders.tableNumber, table),
        isNull(orders.closedAt)
      )
    )
    .orderBy(asc(orders.createdAt));

  const ids = os.map((o) => o.id);
  const its = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
    : [];

  const result = os.map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    items: its
      .filter((i) => i.orderId === o.id)
      .map((i) => ({
        name: i.name,
        quantity: i.quantity,
        alias: i.alias,
        voided: i.voidedAt !== null,
      })),
  }));

  // Stesso calcolo che vede il cassiere, non un conteggio parallelo: se lo
  // staff corregge le persone al tavolo, qui cambia di conseguenza.
  const conto = (await loadOpenTables(tenant.id, table))[0] ?? null;

  return NextResponse.json({ orders: result, conto });
}
