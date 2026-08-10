import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ orders: [] }, { status: 401 });
  }

  const os = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, session.tenantId),
        inArray(orders.status, ["new", "preparing"])
      )
    )
    .orderBy(asc(orders.createdAt));

  const ids = os.map((o) => o.id);
  const its = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
    : [];

  const result = os.map((o) => ({
    id: o.id,
    tableNumber: o.tableNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    items: its
      .filter((i) => i.orderId === o.id)
      .map((i) => ({ name: i.name, quantity: i.quantity, alias: i.alias })),
  }));

  return NextResponse.json({ orders: result });
}
