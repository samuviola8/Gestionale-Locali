import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ tables: [] }, { status: 401 });
  }

  const os = await db
    .select({
      id: orders.id,
      tableNumber: orders.tableNumber,
      status: orders.status,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, session.tenantId), isNull(orders.closedAt)))
    .orderBy(asc(orders.tableNumber));

  const ids = os.map((o) => o.id);
  const its = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
    : [];

  const orderTable = new Map(os.map((o) => [o.id, o.tableNumber]));
  const pending = new Map<number, boolean>();
  for (const o of os) {
    if (o.status === "new" || o.status === "preparing") {
      pending.set(o.tableNumber, true);
    }
  }

  type Line = {
    name: string;
    quantity: number;
    priceCents: number;
    paid: boolean;
  };
  const tablesMap = new Map<number, Map<string, Line[]>>();
  for (const it of its) {
    const tn = orderTable.get(it.orderId);
    if (tn === undefined) continue;
    if (!tablesMap.has(tn)) tablesMap.set(tn, new Map());
    const am = tablesMap.get(tn)!;
    const alias = it.alias ?? "Tavolo";
    if (!am.has(alias)) am.set(alias, []);
    am.get(alias)!.push({
      name: it.name,
      quantity: it.quantity,
      priceCents: it.priceCents,
      paid: it.paid,
    });
  }

  const tables = [...tablesMap.entries()]
    .map(([tableNumber, am]) => {
      const aliases = [...am.entries()].map(([alias, items]) => ({
        alias,
        items,
        subtotal: items.reduce((s, i) => s + i.priceCents * i.quantity, 0),
        allPaid: items.every((i) => i.paid),
      }));
      const total = aliases.reduce((s, a) => s + a.subtotal, 0);
      const incassato = aliases.reduce(
        (s, a) =>
          s +
          a.items
            .filter((i) => i.paid)
            .reduce((x, i) => x + i.priceCents * i.quantity, 0),
        0
      );
      return {
        tableNumber,
        aliases,
        total,
        incassato,
        hasPending: !!pending.get(tableNumber),
      };
    })
    .sort((a, b) => a.tableNumber - b.tableNumber);

  return NextResponse.json({ tables });
}
