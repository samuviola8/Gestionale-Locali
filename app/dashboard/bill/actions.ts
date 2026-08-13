"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billSettlements,
  orders,
  orderItems,
  tableClosures,
  tenants,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { revokeTableSessions } from "@/lib/table-session";
import { ALIAS_CONDIVISO } from "@/lib/bill";
import { loadOpenTables } from "@/lib/bill-query";
import { creaScontrinoConto } from "@/lib/stampa";

// Scontrino del conto su richiesta, prima di chiuderlo: il cliente vuole
// vedere cosa paga, e il tavolo resta aperto.
export async function stampaConto(key: string): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;

  const conto = (await loadOpenTables(session.tenantId)).find(
    (t) => t.key === key
  );
  if (!conto) return;

  await creaScontrinoConto(session.tenantId, conto);
}

// I conti si indirizzano per chiave e non per numero di tavolo: in sala la
// chiave e' il tavolo, fuori e' il singolo ordine, che un numero non ce l'ha.
type Conto =
  | { tipo: "tavolo"; tableNumber: number; ids: string[] }
  | { tipo: "ordine"; orderId: string; ids: string[] };

async function risolvi(tenantId: string, key: string): Promise<Conto | null> {
  if (key.startsWith("t:")) {
    const tableNumber = parseInt(key.slice(2), 10);
    if (!Number.isInteger(tableNumber)) return null;
    const os = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.channel, "tavolo"),
          eq(orders.tableNumber, tableNumber)
        )
      );
    if (!os.length) return null;
    return { tipo: "tavolo", tableNumber, ids: os.map((o) => o.id) };
  }

  if (key.startsWith("o:")) {
    const orderId = key.slice(2);
    const os = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
      .limit(1);
    if (!os.length) return null;
    return { tipo: "ordine", orderId, ids: [orderId] };
  }

  return null;
}

export async function markAliasPaid(key: string, alias: string): Promise<void> {
  const session = await getSessionUser();
  if (!session || !alias) return;
  // "Condiviso" non e' un pagante: la sua spesa e' gia' ripartita in quote.
  if (alias === ALIAS_CONDIVISO) return;

  const conto = await risolvi(session.tenantId, key);
  if (!conto) return;

  // Si calcola quanto deve PRIMA di segnare pagate le sue voci, altrimenti il
  // totale letto dopo sarebbe gia' alterato.
  const tavolo = (await loadOpenTables(session.tenantId)).find(
    (t) => t.key === key
  );
  const persona = tavolo?.people.find((p) => p.alias === alias);
  if (!persona) return;

  await db
    .update(orderItems)
    .set({ paid: true })
    .where(
      and(
        inArray(orderItems.orderId, conto.ids),
        eq(orderItems.alias, alias),
        eq(orderItems.paid, false)
      )
    );

  // Quota del condiviso e coperto non sono righe d'ordine: si registrano qui,
  // insieme all'importo, che da questo momento non cambia piu'. Fuori dalla
  // sala non esistono, quindi non c'e' niente da registrare.
  if (conto.tipo === "tavolo") {
    await db
      .insert(billSettlements)
      .values({
        tenantId: session.tenantId,
        tableNumber: conto.tableNumber,
        alias,
        amountCents: persona.total,
      })
      .onConflictDoNothing();
  }
}

// Archivia il conto: salda i residui, segna gli ordini come serviti
// (li toglie dalla coda) e setta closedAt (li toglie dai conti aperti).
export async function closeTable(key: string): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;

  const conto = await risolvi(session.tenantId, key);
  if (!conto) return;

  // Si legge il conto com'e' adesso, prima di smontarlo: dopo la chiusura il
  // numero di coperti e la tariffa non sarebbero piu' ricostruibili.
  const tavolo = (await loadOpenTables(session.tenantId)).find(
    (t) => t.key === key
  );

  // Scontrino alla chiusura, se il locale l'ha chiesto. Prima di archiviare:
  // dopo, il conto non si legge piu'.
  const [impostazioni] = await db
    .select({ allaChiusura: tenants.printContoAllaChiusura })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (tavolo && impostazioni?.allaChiusura) {
    await creaScontrinoConto(session.tenantId, tavolo);
  }

  if (conto.tipo === "tavolo") {
    // Il tavolo si libera: i telefoni ancora collegati devono riscansionare.
    await revokeTableSessions(session.tenantId, conto.tableNumber);
  }

  await db
    .update(orderItems)
    .set({ paid: true })
    .where(and(inArray(orderItems.orderId, conto.ids), eq(orderItems.paid, false)));

  await db
    .update(orders)
    .set({ status: "served", closedAt: new Date() })
    .where(inArray(orders.id, conto.ids));

  if (conto.tipo === "tavolo") {
    if (tavolo) {
      await db.insert(tableClosures).values({
        tenantId: session.tenantId,
        tableNumber: conto.tableNumber,
        partySize: tavolo.partySize,
        coverChargeCents: tavolo.coverChargeCents,
      });
    }

    // Il conto e' chiuso: le registrazioni degli extra non servono piu' e non
    // devono sporcare il prossimo tavolo con lo stesso numero.
    await db
      .delete(billSettlements)
      .where(
        and(
          eq(billSettlements.tenantId, session.tenantId),
          eq(billSettlements.tableNumber, conto.tableNumber)
        )
      );
  }
}

// Lo staff corregge quante persone sono sedute: il cliente puo' aver
// sbagliato, o si sono aggiunte persone dopo il primo ordine.
export async function setPartySize(
  key: string,
  partySize: number
): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) return;

  const conto = await risolvi(session.tenantId, key);
  // Solo in sala: fuori nessuno e' seduto e non c'e' niente da dividere.
  if (!conto || conto.tipo !== "tavolo") return;

  await db
    .update(orders)
    .set({ partySize })
    .where(inArray(orders.id, conto.ids));
}
