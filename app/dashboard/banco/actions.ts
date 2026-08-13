"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getTenantModules } from "@/lib/modules";
import { getChannel, isChannel, type Channel } from "@/lib/channels";
import {
  createOrderRows,
  type DatiCliente,
  type IncomingItem,
} from "@/lib/order-create";
import { creaScontrinoOrdine } from "@/lib/stampa";

// Ordine battuto alla cassa: al banco, in asporto o da consegnare. Nessun
// tavolo sotto, quindi il conto e' l'ordine stesso.
export async function createCounterOrder(
  channel: Channel,
  items: IncomingItem[],
  cliente: DatiCliente,
  // Al banco si paga subito: l'ordine nasce gia' saldato e archiviato, senza
  // passare dai conti aperti. In asporto e a domicilio invece resta aperto,
  // perche' si incassa al ritiro o alla consegna.
  saldaSubito: boolean,
  // Le spunte dell'operatore, che partono dalle impostazioni ma valgono solo
  // per questo ordine: chi paga un caffe' lo scontrino non lo vuole.
  stampa: { comanda: boolean; scontrino: boolean }
): Promise<{ ok: boolean; comande?: number; scontrino?: boolean }> {
  const session = await getSessionUser();
  if (!session) return { ok: false };
  if (!isChannel(channel) || channel === "tavolo") return { ok: false };

  const canale = getChannel(channel);
  const modules = await getTenantModules(session.tenantId);
  if (!canale.module || !modules[canale.module]) return { ok: false };

  // A domicilio senza indirizzo il fattorino non sa dove andare.
  if (canale.chiedeIndirizzo && !(cliente.indirizzo ?? "").trim()) {
    return { ok: false };
  }

  const esito = await createOrderRows(
    session.tenantId,
    null,
    items,
    modules,
    undefined,
    channel,
    cliente,
    stampa.comanda
  );
  if (!esito.ok) return { ok: false };

  if (stampa.scontrino) {
    await creaScontrinoOrdine(session.tenantId, esito.orderId);
  }

  if (!saldaSubito) {
    return { ok: true, comande: esito.comande, scontrino: stampa.scontrino };
  }

  // Incassato e archiviato, ma NON servito: lo status resta "new" perche' il
  // drink va comunque preparato. Chiuderlo qui lo toglierebbe dalla coda e
  // chi sta alla macchina del caffe' non lo vedrebbe mai.
  await db
    .update(orderItems)
    .set({ paid: true })
    .where(eq(orderItems.orderId, esito.orderId));
  await db
    .update(orders)
    .set({ closedAt: new Date() })
    .where(eq(orders.id, esito.orderId));

  return { ok: true, comande: esito.comande, scontrino: stampa.scontrino };
}
