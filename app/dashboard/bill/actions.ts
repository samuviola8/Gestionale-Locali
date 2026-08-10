"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { revokeTableSessions } from "@/lib/table-session";

async function tableOrderIds(
  tenantId: string,
  tableNumber: number
): Promise<string[]> {
  const os = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.tableNumber, tableNumber)));
  return os.map((o) => o.id);
}

export async function markAliasPaid(
  tableNumber: number,
  alias: string
): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!Number.isInteger(tableNumber) || !alias) return;

  const ids = await tableOrderIds(session.tenantId, tableNumber);
  if (!ids.length) return;

  await db
    .update(orderItems)
    .set({ paid: true })
    .where(
      and(
        inArray(orderItems.orderId, ids),
        eq(orderItems.alias, alias),
        eq(orderItems.paid, false)
      )
    );
}

// Archivia il tavolo: salda i residui, segna gli ordini come serviti
// (li toglie dalla coda) e setta closedAt (li toglie dai conti aperti).
export async function closeTable(tableNumber: number): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!Number.isInteger(tableNumber)) return;

  // Il tavolo si libera: i telefoni ancora collegati devono riscansionare.
  await revokeTableSessions(session.tenantId, tableNumber);

  const ids = await tableOrderIds(session.tenantId, tableNumber);
  if (!ids.length) return;

  await db
    .update(orderItems)
    .set({ paid: true })
    .where(and(inArray(orderItems.orderId, ids), eq(orderItems.paid, false)));

  await db
    .update(orders)
    .set({ status: "served", closedAt: new Date() })
    .where(inArray(orders.id, ids));
}
