import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuProducts, menuProductVariants, orders, orderItems } from "@/lib/db/schema";
import type { ModuleState } from "@/lib/modules";
import { getChannel, type Channel } from "@/lib/channels";
import { creaComande, repartoPerProdotto } from "@/lib/stampa";
import { normalizzaAlias } from "@/lib/bill";

// Un ordine nasce uguale sia dal telefono del cliente sia dalla dashboard del
// cameriere: cambia solo chi ha il diritto di crearlo. Qui sta la parte comune
// (prezzi riletti dal DB, note, quantita'), l'autenticazione resta a chi chiama.

export type IncomingItem = {
  productId: string;
  variantId?: string | null;
  alias: string;
  quantity: number;
  note?: string;
  // Quanti calici portare con questa riga, sui prodotti che li chiedono.
  // 0 = li hanno gia' in tavolo.
  glasses?: number;
};

// Chi ritira o a chi si consegna, quando l'ordine non ha un tavolo.
export type DatiCliente = {
  nome?: string;
  telefono?: string;
  indirizzo?: string;
  consegnaCents?: number;
  // "AAAA-MM-GGTHH:MM" concordato. Con la data e non la sola ora, perche' al
  // telefono si prenota spesso per domani e un orario nudo verrebbe letto
  // come oggi. Chi chiama per le 20:30 va preparato per le 20:30: partire
  // subito vuol dire consegnargli roba fredda.
  oraRitiro?: string;
};

const MAX_NOTA = 200;
const MAX_TESTO = 120;
// Piu' calici di cosi' non e' un tavolo, e' un errore di battitura o un dito
// rimasto sul pulsante.
const MAX_CALICI = 30;

function pulisci(v: string | undefined, max = MAX_TESTO): string | null {
  return (v ?? "").trim().slice(0, max) || null;
}

export async function createOrderRows(
  tenantId: string,
  tableNumber: number | null,
  items: IncomingItem[],
  modules: ModuleState,
  partySize?: number,
  channel: Channel = "tavolo",
  cliente?: DatiCliente,
  // Forzatura della stampa decisa dall'operatore per questo ordine.
  stampaComanda?: boolean
): Promise<
  { ok: false } | { ok: true; orderId: string; comande: number }
> {
  const canale = getChannel(channel);
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
      requiresGlasses: menuProducts.requiresGlasses,
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

      // I calici li tiene solo chi li chiede: su un prodotto qualunque
      // sarebbero un numero che nessuno ha scelto e che il cameriere leggerebbe
      // sulla comanda come una richiesta vera.
      const calici =
        p.requiresGlasses &&
        Number.isInteger(i.glasses) &&
        i.glasses! >= 0 &&
        i.glasses! <= MAX_CALICI
          ? i.glasses!
          : null;

      const quantity = Math.min(i.quantity, 99);
      // Senza il modulo sotto-conti, e fuori dalla sala, tutto finisce su un
      // conto solo: al banco o in consegna non c'e' niente da dividere.
      const alias =
        modules.split_bill && canale.seduti
          ? normalizzaAlias(i.alias)
          : "Tavolo";

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
          calici,
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
        calici,
        alias,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (!rows.length) return { ok: false };

  // Il numero di persone arriva dal client ma non ci si fida: serve a dividere
  // il conto, quindi un valore assurdo va scartato, non salvato. Fuori dalla
  // sala non c'e' nessuno seduto, quindi non si conta nessun coperto.
  const persone =
    canale.seduti &&
    Number.isInteger(partySize) &&
    partySize! >= 1 &&
    partySize! <= 50
      ? partySize!
      : null;

  // La consegna si paga solo dove si consegna, e non oltre il ragionevole.
  const consegna =
    channel === "domicilio" &&
    Number.isInteger(cliente?.consegnaCents) &&
    cliente!.consegnaCents! >= 0 &&
    cliente!.consegnaCents! <= 5000
      ? cliente!.consegnaCents!
      : 0;

  // Il momento concordato arriva con la data: si accetta solo se e' nelle due
  // settimane a venire e non troppo indietro, perche' un ordine per il mese
  // scorso e' un errore di battitura, non una prenotazione.
  let ritiro: Date | null = null;
  const quando = (cliente?.oraRitiro ?? "").trim();
  if (!canale.seduti && /^\d{4}-\d{2}-\d{2}T\d{1,2}:\d{2}$/.test(quando)) {
    const d = new Date(quando);
    const ora = Date.now();
    if (
      !Number.isNaN(d.getTime()) &&
      d.getTime() > ora - 60 * 60 * 1000 &&
      d.getTime() < ora + 14 * 24 * 60 * 60 * 1000
    ) {
      ritiro = d;
    }
  }

  const inserted = await db
    .insert(orders)
    .values({
      tenantId,
      tableNumber: canale.seduti ? tableNumber : null,
      dueAt: ritiro,
      channel,
      status: "new",
      partySize: persone,
      customerName: canale.seduti ? null : pulisci(cliente?.nome),
      customerPhone: canale.seduti ? null : pulisci(cliente?.telefono, 32),
      customerAddress: canale.chiedeIndirizzo
        ? pulisci(cliente?.indirizzo, 200)
        : null,
      deliveryFeeCents: consegna,
    })
    .returning({ id: orders.id });
  const orderId = inserted[0].id;

  // Chi prepara cosa si decide adesso e resta scritto sulla riga: se domani la
  // categoria passa a un altro reparto, la comanda gia' partita non cambia
  // padrone a meta' servizio.
  const reparti = await repartoPerProdotto(
    tenantId,
    rows.map((r) => r.productId)
  );

  await db.insert(orderItems).values(
    rows.map((r) => ({
      orderId,
      productId: r.productId,
      variantId: r.variantId,
      note: r.note,
      glasses: r.calici,
      name: r.name,
      priceCents: r.priceCents,
      quantity: r.quantity,
      alias: r.alias,
      repartoId: reparti.get(r.productId) ?? null,
    }))
  );

  // Le comande partono da sole se il locale ha acceso la stampa per questo
  // canale: la cucina deve partire quando l'ordine arriva, non quando qualcuno
  // si ricorda di stamparlo. Quante ne sono partite torna a chi ha inviato,
  // perche' "non stampa niente" e' l'unico esito che l'operatore non deve
  // scoprire da solo.
  const comande = await creaComande(tenantId, orderId, stampaComanda);

  return { ok: true, orderId, comande };
}
