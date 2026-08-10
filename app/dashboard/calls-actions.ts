"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { waiterCalls } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

export async function resolveCall(id: string): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  await db
    .update(waiterCalls)
    .set({ resolvedAt: new Date() })
    .where(and(eq(waiterCalls.id, id), eq(waiterCalls.tenantId, session.tenantId)));
}
