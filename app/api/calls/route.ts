import { NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { waiterCalls } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ calls: [] }, { status: 401 });
  }

  const rows = await db
    .select({
      id: waiterCalls.id,
      tableNumber: waiterCalls.tableNumber,
      createdAt: waiterCalls.createdAt,
    })
    .from(waiterCalls)
    .where(
      and(
        eq(waiterCalls.tenantId, session.tenantId),
        isNull(waiterCalls.resolvedAt)
      )
    )
    .orderBy(asc(waiterCalls.createdAt));

  return NextResponse.json({
    calls: rows.map((c) => ({
      id: c.id,
      tableNumber: c.tableNumber,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
