"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { waiterCalls } from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { requireTableSession } from "@/lib/table-session";
import { getTenantModules } from "@/lib/modules";
import { createOrderRows, type IncomingItem } from "@/lib/order-create";

export async function createOrder(
  tableNumber: number,
  items: IncomingItem[],
  partySize?: number
): Promise<{ ok: boolean }> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended) return { ok: false };
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) return { ok: false };

  // Serve una sessione aperta scansionando il QR di questo tavolo.
  if (!(await requireTableSession(tenant.id, tableNumber))) return { ok: false };

  const modules = await getTenantModules(tenant.id);
  if (!modules.qr_ordering) return { ok: false };

  return createOrderRows(tenant.id, tableNumber, items, modules, partySize);
}

export async function callWaiter(
  tableNumber: number
): Promise<{ ok: boolean }> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended) return { ok: false };
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) return { ok: false };

  if (!(await requireTableSession(tenant.id, tableNumber))) return { ok: false };

  const modules = await getTenantModules(tenant.id);
  if (!modules.waiter_call) return { ok: false };

  // Se c'e' gia' una chiamata in attesa per il tavolo, non crearne un'altra.
  const existing = await db
    .select({ id: waiterCalls.id })
    .from(waiterCalls)
    .where(
      and(
        eq(waiterCalls.tenantId, tenant.id),
        eq(waiterCalls.tableNumber, tableNumber),
        isNull(waiterCalls.resolvedAt)
      )
    )
    .limit(1);
  if (existing[0]) return { ok: true };

  await db.insert(waiterCalls).values({ tenantId: tenant.id, tableNumber });
  return { ok: true };
}
