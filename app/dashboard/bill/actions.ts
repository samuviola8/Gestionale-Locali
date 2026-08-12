"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billSettlements,
  orders,
  orderItems,
  tableClosures,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { revokeTableSessions } from "@/lib/table-session";
import { ALIAS_CONDIVISO } from "@/lib/bill";
import { loadOpenTables } from "@/lib/bill-query";

async function tableOrderIds(
  tenantId: string,
  tableNumber: number
): Promise<string[]> {
  const os = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.tableNumber, tableNumber)));
  return os.map((o) => o.id);
}

export async function markAliasPaid(
  tableNumber: number,
  alias: string
): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!Number.isInteger(tableNumber) || !alias) return;
  // "Condiviso" non e' un pagante: la sua spesa e' gia' ripartita in quote.
  if (alias === ALIAS_CONDIVISO) return;

  const ids = await tableOrderIds(session.tenantId, tableNumber);
  if (!ids.length) return;

  // Si calcola quanto deve PRIMA di segnare pagate le sue voci, altrimenti il
  // totale letto dopo sarebbe gia' alterato.
  const tavolo = (await loadOpenTables(session.tenantId, tableNumber))[0];
  const persona = tavolo?.people.find((p) => p.alias === alias);
  if (!persona) return;

  await db
    .update(orderItems)
    .set({ paid: true })
    .where(
      and(
        inArray(orderItems.orderId, ids),
        eq(orderItems.alias, alias),
        eq(orderItems.paid, false)
      )
    );

  // Quota del condiviso e coperto non sono righe d'ordine: si registrano qui,
  // insieme all'importo, che da questo momento non cambia piu'.
  await db
    .insert(billSettlements)
    .values({
      tenantId: session.tenantId,
      tableNumber,
      alias,
      amountCents: persona.total,
    })
    .onConflictDoNothing();
}

// Archivia il tavolo: salda i residui, segna gli ordini come serviti
// (li toglie dalla coda) e setta closedAt (li toglie dai conti aperti).
export async function closeTable(tableNumber: number): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!Number.isInteger(tableNumber)) return;

  // Il tavolo si libera: i telefoni ancora collegati devono riscansionare.
  await revokeTableSessions(session.tenantId, tableNumber);

  const ids = await tableOrderIds(session.tenantId, tableNumber);
  if (!ids.length) return;

  // Si legge il tavolo com'e' adesso, prima di smontarlo: dopo la chiusura il
  // numero di coperti e la tariffa non sarebbero piu' ricostruibili.
  const tavolo = (await loadOpenTables(session.tenantId, tableNumber))[0];

  await db
    .update(orderItems)
    .set({ paid: true })
    .where(and(inArray(orderItems.orderId, ids), eq(orderItems.paid, false)));

  await db
    .update(orders)
    .set({ status: "served", closedAt: new Date() })
    .where(inArray(orders.id, ids));

  if (tavolo) {
    await db.insert(tableClosures).values({
      tenantId: session.tenantId,
      tableNumber,
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
        eq(billSettlements.tableNumber, tableNumber)
      )
    );
}

// Lo staff corregge quante persone sono sedute: il cliente puo' aver
// sbagliato, o si sono aggiunte persone dopo il primo ordine.
export async function setPartySize(
  tableNumber: number,
  partySize: number
): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!Number.isInteger(tableNumber)) return;
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 50) return;

  const ids = await tableOrderIds(session.tenantId, tableNumber);
  if (!ids.length) return;

  await db
    .update(orders)
    .set({ partySize })
    .where(inArray(orders.id, ids));
}
