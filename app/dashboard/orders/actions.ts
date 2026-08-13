"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getSessionUser, repartoAttivo } from "@/lib/auth";

const VALID = ["new", "preparing", "served"];

// Avanza la parte di ordine che compete a chi sta guardando: il pizzaiolo
// segna pronte le sue pizze, non i cocktail del barman. Lo stato dell'ordine
// e' la somma dei suoi pezzi, e si ricalcola dopo.
export async function advanceOrderStatus(
  orderId: string,
  status: string
): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!VALID.includes(status)) return;

  const suo = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)))
    .limit(1);
  if (!suo.length) return;

  // Chi non ha un reparto (titolare, cassa) muove tutto l'ordine.
  const mio = repartoAttivo(session);
  const mie = mio
    ? and(eq(orderItems.orderId, orderId), eq(orderItems.repartoId, mio))
    : eq(orderItems.orderId, orderId);

  await db.update(orderItems).set({ status }).where(mie);

  const righe = await db
    .select({ status: orderItems.status, voidedAt: orderItems.voidedAt })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  // Un ordine e' servito quando lo sono tutti i suoi pezzi vivi: finche' la
  // cucina non ha finito, non lo e' nemmeno se il bar ha gia' consegnato.
  const vive = righe.filter((r) => r.voidedAt === null);
  const complessivo = !vive.length
    ? "served"
    : vive.every((r) => r.status === "served")
      ? "served"
      : vive.some((r) => r.status !== "new")
        ? "preparing"
        : "new";

  await db
    .update(orders)
    .set({ status: complessivo })
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)));
}

// Il prodotto e' finito, o l'ordine era sbagliato: la voce esce dal conto.
// Annullata, non cancellata — resta barrata in coda e sul conto, cosi' il
// cliente vede cosa gli e' stato tolto e la cassa sa perche' il totale e' quello.
export async function voidOrderItem(
  itemId: string,
  annulla: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };

  const miei = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.tenantId, session.tenantId));

  // Come per il prezzo: una riga gia' incassata non si tocca, o la cassa non
  // torna piu' con quello che il cliente ha pagato.
  const cambiate = miei.length
    ? await db
        .update(orderItems)
        .set({ voidedAt: annulla ? new Date() : null })
        .where(
          and(
            eq(orderItems.id, itemId),
            inArray(
              orderItems.orderId,
              miei.map((o) => o.id)
            ),
            eq(orderItems.paid, false)
          )
        )
        .returning({ id: orderItems.id })
    : [];

  if (!cambiate.length)
    return { ok: false, error: "Riga già pagata: non si annulla più." };
  return { ok: true };
}

// Il barman corregge il prezzo di una richiesta fuori standard. Si tocca la
// singola riga, non il prodotto a listino: la prossima richiesta riparte dal
// prezzo di partenza.
// Risponde sempre com'e' andata: un prezzo che non passa in silenzio e' peggio
// di un errore, perche' il barman chiude l'editor convinto di averlo cambiato.
export async function setItemPrice(
  itemId: string,
  priceCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000)
    return { ok: false, error: "Prezzo non valido." };

  // La riga dev'essere di un ordine di questo locale, e non ancora saldata:
  // cambiare il prezzo di qualcosa di gia' incassato falserebbe la cassa.
  const miei = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.tenantId, session.tenantId));

  const cambiate = miei.length
    ? await db
        .update(orderItems)
        .set({ priceCents, priceAdjusted: true })
        .where(
          and(
            eq(orderItems.id, itemId),
            inArray(
              orderItems.orderId,
              miei.map((o) => o.id)
            ),
            eq(orderItems.paid, false)
          )
        )
        .returning({ id: orderItems.id })
    : [];

  if (!cambiate.length)
    return { ok: false, error: "Riga già pagata: il prezzo non si tocca più." };
  return { ok: true };
}
