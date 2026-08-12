import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuProducts, menuProductVariants, orders, orderItems } from "@/lib/db/schema";
import type { ModuleState } from "@/lib/modules";

// Un ordine nasce uguale sia dal telefono del cliente sia dalla dashboard del
// cameriere: cambia solo chi ha il diritto di crearlo. Qui sta la parte comune
// (prezzi riletti dal DB, note, quantita'), l'autenticazione resta a chi chiama.

export type IncomingItem = {
  productId: string;
  variantId?: string | null;
  alias: string;
  quantity: number;
  note?: string;
};

const MAX_NOTA = 200;

export async function createOrderRows(
  tenantId: string,
  tableNumber: number,
  items: IncomingItem[],
  modules: ModuleState,
  partySize?: number
): Promise<{ ok: boolean }> {
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
      acceptsNote: menuProducts.acceptsNote,
    })
    .from(menuProducts)
    .where(and(eq(menuProducts.tenantId, tenantId), inArray(menuProducts.id, ids)));
  const byId = new Map(prods.map((p) => [p.id, p]));

  // Anche le varianti vengono rilette dal DB: prezzo e nome non arrivano mai
  // dal client, e la variante deve appartenere al prodotto richiesto.
  const variantIds = clean.map((i) => i.variantId).filter((v): v is string => !!v);
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
            eq(menuProductVariants.tenantId, tenantId),
            inArray(menuProductVariants.id, [...new Set(variantIds)])
          )
        )
    : [];
  const variantById = new Map(variants.map((v) => [v.id, v]));

  const rows = clean
    .map((i) => {
      const p = byId.get(i.productId);
      if (!p || !p.available) return null;

      // La nota si accetta su qualunque prodotto — "senza menta", "ben cotta" —
      // con un tetto, perche' e' testo libero che finisce sotto gli occhi di chi
      // prepara. Sui prodotti su richiesta invece la nota e' il prodotto: senza,
      // il barman non saprebbe cosa versare.
      const nota = (i.note ?? "").trim().slice(0, MAX_NOTA) || null;
      if (p.acceptsNote && !nota) return null;

      const quantity = Math.min(i.quantity, 99);
      // Senza il modulo sotto-conti tutto finisce sul conto del tavolo,
      // qualunque cosa mandi il client.
      const alias = modules.split_bill ? i.alias?.trim() || "Tavolo" : "Tavolo";

      if (i.variantId) {
        const v = variantById.get(i.variantId);
        if (!v || v.productId !== p.id || !v.available) return null;
        return {
          productId: p.id,
          variantId: v.id,
          name: `${p.name} — ${v.name}`,
          priceCents: v.priceCents,
          quantity,
          note: nota,
          alias,
        };
      }

      return {
        productId: p.id,
        variantId: null,
        name: p.name,
        priceCents: p.priceCents,
        quantity,
        note: nota,
        alias,
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
    .values({ tenantId, tableNumber, status: "new", partySize: persone })
    .returning({ id: orders.id });
  const orderId = inserted[0].id;

  await db.insert(orderItems).values(
    rows.map((r) => ({
      orderId,
      productId: r.productId,
      variantId: r.variantId,
      note: r.note,
      name: r.name,
      priceCents: r.priceCents,
      quantity: r.quantity,
      alias: r.alias,
    }))
  );

  return { ok: true };
}
