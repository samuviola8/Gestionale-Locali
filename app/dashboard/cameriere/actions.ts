"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getTenantModules } from "@/lib/modules";
import { createOrderRows, type IncomingItem } from "@/lib/order-create";
import { staccaCondiviso } from "@/lib/condiviso";

// Ordine preso a voce dal cameriere, al tavolo. Stessa interfaccia del cliente,
// ma al posto della sessione del tavolo vale il login dello staff — il cameriere
// non ha scansionato nessun QR, e non deve doverlo fare.
export async function createStaffOrder(
  tableNumber: number,
  items: IncomingItem[],
  partySize?: number
): Promise<{ ok: boolean }> {
  const session = await getSessionUser();
  if (!session) return { ok: false };
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) return { ok: false };

  // Il tavolo dev'essere uno di questo locale: cosi' una cifra a caso non
  // apre un conto fantasma che poi nessuno trova in cassa.
  const esiste = await db
    .select({ id: restaurantTables.id })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, session.tenantId),
        eq(restaurantTables.number, tableNumber)
      )
    )
    .limit(1);
  if (!esiste.length) return { ok: false };

  // Senza il modulo ordini la coda non esiste: un ordine preso qui finirebbe
  // dove nessuno lo guarda.
  const modules = await getTenantModules(session.tenantId);
  if (!modules.qr_ordering) return { ok: false };

  return createOrderRows(session.tenantId, tableNumber, items, modules, {
    partySize,
  });
}

// Stessa cosa, ma richiesta dal cameriere: al posto della sessione del tavolo
// vale il suo login.
export async function chiudiCondivisoStaff(
  tableNumber: number
): Promise<{ ok: boolean }> {
  const session = await getSessionUser();
  if (!session) return { ok: false };
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) return { ok: false };

  const modules = await getTenantModules(session.tenantId);
  if (!modules.split_bill) return { ok: false };

  const esito = await staccaCondiviso(session.tenantId, tableNumber);
  return { ok: esito.ok };
}

// Il cameriere sta gia' davanti al cliente: non ha nessuno da chiamare.
export async function noopCallWaiter(): Promise<{ ok: boolean }> {
  return { ok: false };
}
