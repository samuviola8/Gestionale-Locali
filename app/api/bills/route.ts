import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { loadOpenTables } from "@/lib/bill-query";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ tables: [] }, { status: 401 });
  }

  const tables = await loadOpenTables(session.tenantId);
  return NextResponse.json({ tables });
}
