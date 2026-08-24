"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billSettlements,
  orders,
  orderItems,
  tableClosures,
  tenants,
  waiterCalls,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { revokeTableSessions } from "@/lib/table-session";
import {
  ALIAS_CONDIVISO,
  aliasGruppo,
  eGruppo,
  membriDi,
  normalizzaAlias,
} from "@/lib/bill";
import { loadOpenTables } from "@/lib/bill-query";
import { chiudiSeduta } from "@/lib/sedute";
import { creaComande, creaScontrinoConto } from "@/lib/stampa";
import { revalidatePath } from "next/cache";
import { getTenantModules } from "@/lib/modules";
import {
  aggiungiRighe,
  createOrderRows,
  type IncomingItem,
} from "@/lib/order-create";

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
  // Un gruppo non e' un pagante: la sua spesa esiste gia' ripartita in quote
  // sui suoi, e incassarla di nuovo qui la conterebbe due volte.
  if (eGruppo(alias)) return;

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
    // Il gruppo se n'e' andato, e se ne va da tutti i tavoli che occupava: il
    // conto e' uno anche quando i tavoli erano due accostati. Liberarne uno
    // solo lascerebbe l'altro occupato da nessuno per il resto della serata.
    const seduta = await chiudiSeduta(session.tenantId, conto.tableNumber);
    const tavoli = seduta?.tavoli ?? [conto.tableNumber];

    // I telefoni ancora collegati devono riscansionare.
    for (const n of tavoli) {
      await revokeTableSessions(session.tenantId, n);
    }

    // E chi aveva chiamato se n'e' andato: una chiamata lasciata aperta fa
    // suonare la campanella per un tavolo che non c'e' piu', e chi va a
    // vedere trova le sedie vuote.
    await db
      .update(waiterCalls)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(waiterCalls.tenantId, session.tenantId),
          inArray(waiterCalls.tableNumber, tavoli),
          isNull(waiterCalls.resolvedAt)
        )
      );
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

// Chi ordina non e' sempre chi paga: uno ha preso il giro per tutti, un altro
// si e' intestato una cosa che andava divisa in due. La voce si riporta su chi
// la paga davvero — una persona, due, il tavolo intero — e se le copie sono
// piu' d'una se ne sposta solo una parte: la riga si spezza, e il resto resta
// dov'era.
//
// Si riscrive l'intestazione e basta: la comanda andata in cucina non cambia,
// perche' quello e' stato davvero ordinato. A cambiare e' solo chi lo paga.
export async function spostaVoce(
  itemId: string,
  nomi: string[],
  quantita: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };

  const [riga] = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      productId: orderItems.productId,
      variantId: orderItems.variantId,
      name: orderItems.name,
      priceCents: orderItems.priceCents,
      quantity: orderItems.quantity,
      note: orderItems.note,
      priceAdjusted: orderItems.priceAdjusted,
      voidedAt: orderItems.voidedAt,
      repartoId: orderItems.repartoId,
      status: orderItems.status,
      alias: orderItems.alias,
      paid: orderItems.paid,
      channel: orders.channel,
      tableNumber: orders.tableNumber,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.id, itemId),
        eq(orders.tenantId, session.tenantId),
        isNull(orders.closedAt)
      )
    )
    .limit(1);

  if (!riga) return { ok: false, error: "Questa voce non è più sul conto." };
  // Come per l'annullo e per il prezzo: una riga incassata non si tocca, o la
  // cassa non torna piu' con quello che il cliente ha pagato.
  if (riga.paid) return { ok: false, error: "Riga già pagata: non si sposta." };
  // Si divide dove c'e' gente seduta. Fuori dalla sala l'intestatario e' uno
  // solo, ed e' quello che ritira: non c'e' nessuno su cui spostare.
  if (riga.channel !== "tavolo")
    return { ok: false, error: "Il conto è di una persona sola." };
  if (!Number.isInteger(quantita) || quantita < 1 || quantita > riga.quantity)
    return { ok: false, error: "Quantità non valida." };

  // I nomi arrivano da un browser: si tiene solo quello che e' davvero un
  // nome, e normalizzaAlias fa il resto. Come per l'ordine dal telefono, non
  // e' chi ha in mano la pagina a decidere che forma ha un intestatario.
  const scelti = (Array.isArray(nomi) ? nomi : []).filter(
    (n): n is string => typeof n === "string"
  );
  // "Condiviso" e' il gruppo di tutti e non si compone di nomi: sceglierlo
  // insieme a qualcuno vorrebbe dire tutti e due, e vince il piu' largo.
  const aTutti = scelti.includes(ALIAS_CONDIVISO);
  const alias = aTutti ? ALIAS_CONDIVISO : normalizzaAlias(aliasGruppo(scelti));
  if (alias === "Tavolo") return { ok: false, error: "Scegli chi la paga." };
  if (alias === riga.alias && quantita === riga.quantity) return { ok: true };

  const tavolo = (
    await loadOpenTables(session.tenantId, riga.tableNumber ?? 0)
  )[0];

  // Chi ha gia' pagato ha un totale congelato: mettergli adesso una voce sul
  // conto vorrebbe dire lasciarla a carico di nessuno. Lo si dice, invece di
  // spostarla in silenzio dove non verra' mai incassata.
  const pagato = new Set(
    (tavolo?.people ?? []).filter((p) => p.paid).map((p) => p.alias)
  );
  const destinatari = aTutti
    ? (tavolo?.people ?? []).map((p) => p.alias)
    : membriDi(alias);
  const chiHaPagato = destinatari.find((d) => pagato.has(d));
  if (chiHaPagato)
    return {
      ok: false,
      error: `${chiHaPagato} ha già pagato: mettila su chi deve ancora farlo.`,
    };

  if (quantita >= riga.quantity) {
    await db
      .update(orderItems)
      .set({ alias })
      .where(eq(orderItems.id, riga.id));
    return { ok: true };
  }

  // Ne sposta solo una parte: quella che resta si scala, quella che va si
  // riscrive uguale sotto un altro nome. Stesso prezzo e stesso stato, cosi'
  // in coda la riga spezzata non torna indietro a "da preparare".
  await db
    .update(orderItems)
    .set({ quantity: riga.quantity - quantita })
    .where(eq(orderItems.id, riga.id));

  await db.insert(orderItems).values({
    orderId: riga.orderId,
    productId: riga.productId,
    variantId: riga.variantId,
    name: riga.name,
    priceCents: riga.priceCents,
    quantity: quantita,
    note: riga.note,
    // I calici sono gia' in tavola da un pezzo: chiederne altri adesso, che si
    // sta facendo il conto, manderebbe un cameriere a portarli per niente.
    glasses: null,
    priceAdjusted: riga.priceAdjusted,
    voidedAt: riga.voidedAt,
    repartoId: riga.repartoId,
    status: riga.status,
    alias,
  });

  return { ok: true };
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

// --- Aggiungere a un conto gia' aperto ---------------------------------------
//
// Il cliente richiama: «mi aggiungete due birre». Finora si poteva solo
// annullare o spostare, e per aggiungere bisognava aprire un secondo ordine —
// che al ritiro diventa un secondo conto da incassare a parte.
//
// Le due strade sono diverse perche' i due conti sono diversi. Al tavolo il
// conto raccoglie piu' ordini, quindi si scrive un ordine nuovo: entra in coda
// col suo orario, e chi prepara vede una comanda che e' arrivata adesso. Fuori
// dalla sala il conto **e'** un ordine: le righe si attaccano a quello, e si
// stampa solo la comanda delle righe nuove — ristampare tutto vorrebbe dire
// fare rifare la cena da capo.
export async function aggiungiAlConto(
  key: string,
  righe: IncomingItem[]
): Promise<{ ok: true; comande: number } | { ok: false; error: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };
  if (!righe.length) return { ok: false, error: "Non hai scelto niente." };

  const modules = await getTenantModules(session.tenantId);

  // Al tavolo: un ordine nuovo, come se l'avesse battuto il cameriere.
  if (key.startsWith("t:")) {
    const tavolo = parseInt(key.slice(2), 10);
    if (!Number.isInteger(tavolo) || tavolo <= 0) {
      return { ok: false, error: "Tavolo non valido." };
    }
    const esito = await createOrderRows(
      session.tenantId,
      tavolo,
      righe,
      modules,
      { channel: "tavolo" }
    );
    if (!esito.ok) return { ok: false, error: "Non sono riuscito ad aggiungere." };
    revalidatePath("/dashboard/bill");
    return { ok: true, comande: esito.comande };
  }

  // Fuori dalla sala: si attaccano all'ordine che e' il conto.
  const orderId = key.startsWith("o:") ? key.slice(2) : "";
  const [o] = await db
    .select({
      id: orders.id,
      channel: orders.channel,
      status: orders.status,
      tableNumber: orders.tableNumber,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)))
    .limit(1);
  if (!o) return { ok: false, error: "Conto non trovato." };
  // Un ordine dal sito ancora da accettare non si tocca da qui: prima lo si
  // accetta in coda, che e' il posto dove parte anche la comanda.
  if (o.status === "pending") {
    return { ok: false, error: "Prima accetta l'ordine dalla coda." };
  }

  const esito = await aggiungiRighe(session.tenantId, o.id, righe, modules);
  if (!esito.ok) return { ok: false, error: "Non sono riuscito ad aggiungere." };

  // Solo le righe nuove: la comanda dice «AGGIUNTA», e in cucina non rifanno
  // quello che stavano gia' preparando.
  const comande = await creaComande(
    session.tenantId,
    o.id,
    undefined,
    esito.righe
  );

  revalidatePath("/dashboard/bill");
  revalidatePath("/dashboard/orders");
  return { ok: true, comande };
}
