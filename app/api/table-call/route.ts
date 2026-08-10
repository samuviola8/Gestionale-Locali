import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { waiterCalls } from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { requireTableSession } from "@/lib/table-session";

// Dice se c'e' una chiamata cameriere in attesa per il tavolo, cosi' tutti i
// telefoni seduti li' vedono lo stesso stato. Serve la sessione del QR.
export async function GET(req: Request) {
  const tenant = await getTenantFromHost();
  if (!tenant) return NextResponse.json({ pending: false });

  const { searchParams } = new URL(req.url);
  const table = parseInt(searchParams.get("table") ?? "", 10);
  if (!Number.isInteger(table)) return NextResponse.json({ pending: false });

  if (!(await requireTableSession(tenant.id, table)))
    return NextResponse.json({ pending: false, scaduta: true }, { status: 401 });

  const rows = await db
    .select({ id: waiterCalls.id })
    .from(waiterCalls)
    .where(
      and(
        eq(waiterCalls.tenantId, tenant.id),
        eq(waiterCalls.tableNumber, table),
        isNull(waiterCalls.resolvedAt)
      )
    )
    .limit(1);

  return NextResponse.json({ pending: !!rows[0] });
}
