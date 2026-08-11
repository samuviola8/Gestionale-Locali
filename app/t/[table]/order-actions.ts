"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuProducts,
  menuProductVariants,
  orders,
  orderItems,
  waiterCalls,
} from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { requireTableSession } from "@/lib/table-session";
import { getTenantModules } from "@/lib/modules";

type IncomingItem = {
  productId: string;
  variantId?: string | null;
  alias: string;
  quantity: number;
};

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

  const clean = items.filter((i) => i.productId && i.quantity > 0);
  if (!clean.length) return { ok: false };

  // Prezzi e nomi vengono presi dal DB, mai dal client.
  const ids = [...new Set(clean.map((i) => i.productId))];
  const prods = await db
    .select({
      id: menuProducts.id,
      name: menuProducts.name,
      priceCents: menuProducts.priceCents,
      available: menuProducts.available,
    })
    .from(menuProducts)
    .where(and(eq(menuProducts.tenantId, tenant.id), inArray(menuProducts.id, ids)));
  const byId = new Map(prods.map((p) => [p.id, p]));

  // Anche le varianti vengono rilette dal DB: prezzo e nome non arrivano mai
  // dal client, e la variante deve appartenere al prodotto richiesto.
  const variantIds = clean
    .map((i) => i.variantId)
    .filter((v): v is string => !!v);
  const variants = variantIds.length
    ? await db
        .select({
          id: menuProductVariants.id,
          productId: menuProductVariants.productId,
          name: menuProductVariants.name,
          priceCents: menuProductVariants.priceCents,
          available: menuProductVariants.available,
        })
        .from(menuProductVariants)
        .where(
          and(
            eq(menuProductVariants.tenantId, tenant.id),
            inArray(menuProductVariants.id, [...new Set(variantIds)])
          )
        )
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const rows = clean
    .map((i) => {
      const p = byId.get(i.productId);
      if (!p || !p.available) return null;

      if (i.variantId) {
        const v = variantById.get(i.variantId);
        if (!v || v.productId !== p.id || !v.available) return null;
        return {
          productId: p.id,
          variantId: v.id,
          name: `${p.name} — ${v.name}`,
          priceCents: v.priceCents,
          quantity: Math.min(i.quantity, 99),
          alias: modules.split_bill ? i.alias?.trim() || "Tavolo" : "Tavolo",
        };
      }

      return {
        productId: p.id,
        variantId: null,
        name: p.name,
        priceCents: p.priceCents,
        quantity: Math.min(i.quantity, 99),
        // Senza il modulo sotto-conti tutto finisce sul conto del tavolo,
        // qualunque cosa mandi il client.
        alias: modules.split_bill ? i.alias?.trim() || "Tavolo" : "Tavolo",
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) return { ok: false };

  // Il numero di persone arriva dal client ma non ci si fida: serve a dividere
  // il conto, quindi un valore assurdo va scartato, non salvato.
  const persone =
    Number.isInteger(partySize) && partySize! >= 1 && partySize! <= 50
      ? partySize!
      : null;

  const inserted = await db
    .insert(orders)
    .values({ tenantId: tenant.id, tableNumber, status: "new", partySize: persone })
    .returning({ id: orders.id });
  const orderId = inserted[0].id;

  await db.insert(orderItems).values(
    rows.map((r) => ({
      orderId,
      productId: r.productId,
      variantId: r.variantId,
      name: r.name,
      priceCents: r.priceCents,
      quantity: r.quantity,
      alias: r.alias,
    }))
  );

  return { ok: true };
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
