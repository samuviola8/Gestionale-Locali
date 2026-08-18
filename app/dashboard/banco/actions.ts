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
import { salvaClienteDaOrdine, spezzaIndirizzo } from "@/lib/rubrica";

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
  stampa: { comanda: boolean; scontrino: boolean },
  // Se chi ha ordinato finisce in rubrica. La spunta parte accesa, ma
  // l'ultima parola ce l'ha chi sta alla cassa: davanti ha una persona che
  // puo' benissimo non voler lasciare nome e indirizzo da nessuna parte.
  salvaCliente = false
): Promise<{
  ok: boolean;
  comande?: number;
  scontrino?: boolean;
  cliente?: boolean;
}> {
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

  // La rubrica si riempie lavorando: e' l'unico modo perche' si riempia.
  // Al banco non c'e' niente da scrivere — il cliente e' chi sta davanti
  // alla cassa e non lascia ne' nome ne' numero.
  let inRubrica = false;
  if (salvaCliente && modules.customers && canale.chiedeNome) {
    // L'indirizzo torna nei suoi pezzi: alla cassa viaggia come riga
    // unica, ma in rubrica il civico sta in un campo suo, perche' e'
    // quello che si perde e quello senza cui il fattorino gira a vuoto.
    const dove = spezzaIndirizzo(cliente.indirizzo ?? "");
    const scheda = await salvaClienteDaOrdine(session.tenantId, {
      nome: cliente.nome,
      telefono: cliente.telefono,
      via: dove.via,
      civico: dove.civico,
      dettaglio: dove.dettaglio,
    });
    inRubrica = !!scheda;
  }

  if (!saldaSubito) {
    return {
      ok: true,
      comande: esito.comande,
      scontrino: stampa.scontrino,
      cliente: inRubrica,
    };
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

  return {
    ok: true,
    comande: esito.comande,
    scontrino: stampa.scontrino,
    cliente: inRubrica,
  };
}
