"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

const VALID = ["new", "preparing", "served"];

export async function advanceOrderStatus(
  orderId: string,
  status: string
): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!VALID.includes(status)) return;

  await db
    .update(orders)
    .set({ status })
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)));
}
