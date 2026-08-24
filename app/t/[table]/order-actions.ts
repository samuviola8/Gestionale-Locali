"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { waiterCalls } from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { requireTableSession } from "@/lib/table-session";
import { getTenantModules } from "@/lib/modules";
import { createOrderRows, type IncomingItem } from "@/lib/order-create";
import { staccaCondiviso } from "@/lib/condiviso";
import { salvaRecensione, salvaTestimonianza } from "@/lib/recensioni";

export async function createOrder(
  tableNumber: number,
  items: IncomingItem[],
  partySize?: number
): Promise<{ ok: boolean; orderId?: string }> {
  // `orderId` torna indietro perche' la pagina, subito dopo, puo' chiedere
  // com'e' andata: e' l'unico modo che ha di dire a quale ordine si riferisce
  // la risposta. Senza, la domanda al tavolo non saprebbe cosa recensire.
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) return { ok: false };
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) return { ok: false };

  // Serve una sessione aperta scansionando il QR di questo tavolo.
  if (!(await requireTableSession(tenant.id, tableNumber))) return { ok: false };

  const modules = await getTenantModules(tenant.id);
  if (!modules.qr_ordering) return { ok: false };

  return createOrderRows(tenant.id, tableNumber, items, modules, { partySize });
}

// Chiude il condiviso su chi c'e' adesso, prima che al tavolo si sieda
// qualcun altro. Vale la stessa sessione con cui si ordina: chi puo' mettere
// una voce sul conto di un altro puo' anche dire fin dove arrivava la loro.
export async function chiudiCondiviso(
  tableNumber: number
): Promise<{ ok: boolean }> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) return { ok: false };
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) return { ok: false };

  if (!(await requireTableSession(tenant.id, tableNumber))) return { ok: false };

  const modules = await getTenantModules(tenant.id);
  if (!modules.split_bill) return { ok: false };

  const esito = await staccaCondiviso(tenant.id, tableNumber);
  return { ok: esito.ok };
}

export async function callWaiter(
  tableNumber: number
): Promise<{ ok: boolean }> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) return { ok: false };
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

// --- Com'e' andata, al tavolo ------------------------------------------------
//
// Si chiede dopo l'invio, ed e' una riga sola che si chiude: chi sta mangiando
// non deve trovarsi un questionario addosso. La chiave e' la sessione del
// tavolo, la stessa con cui si ordina — chi puo' mettere una consumazione sul
// conto puo' anche dire com'e' andata.

export async function recensisciDalTavolo(
  tableNumber: number,
  orderId: string,
  voto: number,
  testo: string
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) {
    return { ok: false, errore: "Locale non trovato." };
  }
  if (!(await requireTableSession(tenant.id, tableNumber))) {
    return { ok: false, errore: "Sessione scaduta: riscansiona il QR." };
  }

  return salvaRecensione({
    tenantId: tenant.id,
    orderId,
    canale: "tavolo",
    voto,
    testo,
  });
}

export async function testimoniaDalTavolo(
  tableNumber: number,
  voto: number,
  testo: string,
  firma: string,
  pubblicabile: boolean
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) {
    return { ok: false, errore: "Locale non trovato." };
  }
  if (!(await requireTableSession(tenant.id, tableNumber))) {
    return { ok: false, errore: "Sessione scaduta: riscansiona il QR." };
  }

  return salvaTestimonianza({
    tenantId: tenant.id,
    nomeLocale: tenant.name,
    ruolo: "cliente",
    voto,
    testo,
    firma,
    pubblicabile,
  });
}
