import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuProducts,
  orderItems,
  orders,
  tableClosures,
} from "@/lib/db/schema";

// Statistiche di un locale su un intervallo.
//
// Il periodo si riferisce a QUANDO E' STATO ORDINATO, non a quando si e'
// pagato: e' quello che risponde a "com'e' andata sabato sera". Le voci
// annullate non entrano in nessuna somma, come sul conto.

export type Periodo = { da: Date; a: Date };

export type VoceClassifica = {
  nome: string;
  pezzi: number;
  incassoCents: number;
};

export type Analytics = {
  incassoCents: number;
  // Parte gia' saldata: il resto e' su tavoli ancora aperti.
  incassatoCents: number;
  coperti: number;
  copertoCents: number;
  ordini: number;
  tavoliChiusi: number;
  pezzi: number;
  // Per persona seduta, non per ordine: e' il numero che il locale confronta
  // con le altre serate.
  scontrinoMedioCents: number;
  // Quanto viene dalle consumazioni e quanto dal coperto.
  consumazioniCents: number;
  perGiorno: {
    giorno: string;
    incassoCents: number;
    ordini: number;
    coperti: number;
    tavoli: number;
  }[];
  perOra: { ora: number; incassoCents: number; ordini: number }[];
  // Lunedi'=0. Un bar vive di giorni della settimana, non di date.
  perGiornoSettimana: { giorno: number; incassoCents: number; ordini: number }[];
  // Ordini per giorno della settimana e fascia oraria: dice quando serve gente
  // dietro al banco, che e' la domanda vera dietro a "quanto ho incassato".
  affluenza: { giorno: number; ora: number; ordini: number }[];
  topProdotti: VoceClassifica[];
  topCategorie: VoceClassifica[];
  annullati: VoceClassifica[];
  // Prodotti a listino che nel periodo non ha ordinato nessuno: su un menu
  // lungo e' il dato che nessuno guarda mai e che conviene guardare.
  maiOrdinati: { nome: string; categoria: string; priceCents: number }[];
  prodottiAListino: number;
  richieste: { testo: string; prodotto: string; quando: Date }[];
  // Stesso intervallo, spostato indietro: un incasso da solo non dice niente.
  precedente: Confronto;
};

export type Confronto = {
  incassoCents: number;
  ordini: number;
  coperti: number;
  scontrinoMedioCents: number;
};

function giornoISO(d: Date): string {
  // Chiave giorno in ora locale: raggruppare in UTC sposterebbe la serata
  // dopo mezzanotte al giorno sbagliato.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

function classifica(
  mappa: Map<string, { pezzi: number; incassoCents: number }>,
  quanti: number
): VoceClassifica[] {
  return [...mappa.entries()]
    .map(([nome, v]) => ({ nome, ...v }))
    .sort((a, b) => b.incassoCents - a.incassoCents || b.pezzi - a.pezzi)
    .slice(0, quanti);
}

// Lunedi'=0, domenica=6: in Italia la settimana comincia di lunedi', e un
// grafico che parte di domenica si legge male.
function giornoSettimana(d: Date): number {
  return (d.getDay() + 6) % 7;
}

// Solo i numeri di testa, per il confronto col periodo precedente: rifare
// tutte le classifiche per una freccia accanto a una cifra sarebbe sprecato.
export async function getTotali(
  tenantId: string,
  periodo: Periodo
): Promise<Confronto> {
  const os = await db
    .select({ id: orders.id, closedAt: orders.closedAt })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, periodo.da),
        lt(orders.createdAt, periodo.a)
      )
    );

  const ids = os.map((o) => o.id);
  const righe = ids.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          priceCents: orderItems.priceCents,
          quantity: orderItems.quantity,
          voidedAt: orderItems.voidedAt,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, ids))
    : [];

  const chiusure = await db
    .select({
      partySize: tableClosures.partySize,
      coverChargeCents: tableClosures.coverChargeCents,
    })
    .from(tableClosures)
    .where(
      and(
        eq(tableClosures.tenantId, tenantId),
        gte(tableClosures.closedAt, periodo.da),
        lt(tableClosures.closedAt, periodo.a)
      )
    );

  const coperti = chiusure.reduce((s, c) => s + c.partySize, 0);
  const copertoCents = chiusure.reduce(
    (s, c) => s + c.partySize * c.coverChargeCents,
    0
  );
  const chiusi = new Set(os.filter((o) => o.closedAt).map((o) => o.id));

  let incassoCents = copertoCents;
  let incassoChiusi = copertoCents;
  for (const r of righe) {
    if (r.voidedAt !== null) continue;
    const v = r.priceCents * r.quantity;
    incassoCents += v;
    if (chiusi.has(r.orderId)) incassoChiusi += v;
  }

  return {
    incassoCents,
    ordini: os.length,
    coperti,
    scontrinoMedioCents: coperti > 0 ? Math.round(incassoChiusi / coperti) : 0,
  };
}

export async function getAnalytics(
  tenantId: string,
  periodo: Periodo
): Promise<Analytics> {
  const os = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      closedAt: orders.closedAt,
      tableNumber: orders.tableNumber,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, periodo.da),
        lt(orders.createdAt, periodo.a)
      )
    )
    .orderBy(asc(orders.createdAt));

  const ids = os.map((o) => o.id);
  const righe = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
    : [];

  // Nome della categoria per ogni prodotto ancora a listino. I prodotti
  // cancellati dopo restano nelle classifiche per nome, senza categoria: la
  // riga d'ordine conserva il nome, non il legame.
  const prodottiIds = [
    ...new Set(righe.map((r) => r.productId).filter((x): x is string => !!x)),
  ];
  const categoriaDi = new Map<string, string>();
  if (prodottiIds.length) {
    const rows = await db
      .select({ id: menuProducts.id, categoria: menuCategories.name })
      .from(menuProducts)
      .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
      .where(
        and(
          eq(menuProducts.tenantId, tenantId),
          inArray(menuProducts.id, prodottiIds)
        )
      );
    rows.forEach((r) => categoriaDi.set(r.id, r.categoria));
  }

  const chiusure = await db
    .select({
      partySize: tableClosures.partySize,
      coverChargeCents: tableClosures.coverChargeCents,
      closedAt: tableClosures.closedAt,
    })
    .from(tableClosures)
    .where(
      and(
        eq(tableClosures.tenantId, tenantId),
        gte(tableClosures.closedAt, periodo.da),
        lt(tableClosures.closedAt, periodo.a)
      )
    );

  const coperti = chiusure.reduce((s, c) => s + c.partySize, 0);
  const copertoCents = chiusure.reduce(
    (s, c) => s + c.partySize * c.coverChargeCents,
    0
  );

  const quandoOrdine = new Map(os.map((o) => [o.id, o.createdAt]));
  const ordineChiuso = new Set(
    os.filter((o) => o.closedAt !== null).map((o) => o.id)
  );

  let incassoCents = copertoCents;
  let incassatoCents = copertoCents;
  // Solo i tavoli archiviati: lo scontrino medio si calcola su questo, perche'
  // i coperti si contano alla chiusura. Mescolarci l'incasso dei tavoli ancora
  // seduti gonfierebbe la media di un fattore che non c'entra.
  let incassoChiusiCents = copertoCents;
  let pezzi = 0;
  const perGiorno = new Map<
    string,
    { incassoCents: number; ordini: number; coperti: number; tavoli: number }
  >();
  const vuotoGiorno = { incassoCents: 0, ordini: 0, coperti: 0, tavoli: 0 };
  const perOra = new Map<number, { incassoCents: number; ordini: number }>();
  const perSettimana = new Map<
    number,
    { incassoCents: number; ordini: number }
  >();
  const affluenza = new Map<string, number>();
  const prodotti = new Map<string, { pezzi: number; incassoCents: number }>();
  const categorie = new Map<string, { pezzi: number; incassoCents: number }>();
  const annullati = new Map<string, { pezzi: number; incassoCents: number }>();
  const richieste: Analytics["richieste"] = [];

  for (const r of righe) {
    const quando = quandoOrdine.get(r.orderId);
    if (!quando) continue;
    const valore = r.priceCents * r.quantity;

    if (r.note) {
      richieste.push({ testo: r.note, prodotto: r.name, quando });
    }

    // Le annullate si contano a parte: sapere cosa finisce piu' spesso e'
    // un'informazione utile quanto sapere cosa si vende.
    if (r.voidedAt !== null) {
      const a = annullati.get(r.name) ?? { pezzi: 0, incassoCents: 0 };
      annullati.set(r.name, {
        pezzi: a.pezzi + r.quantity,
        incassoCents: a.incassoCents + valore,
      });
      continue;
    }

    incassoCents += valore;
    if (r.paid) incassatoCents += valore;
    if (ordineChiuso.has(r.orderId)) incassoChiusiCents += valore;
    pezzi += r.quantity;

    const g = giornoISO(quando);
    const pg = perGiorno.get(g) ?? vuotoGiorno;
    perGiorno.set(g, { ...pg, incassoCents: pg.incassoCents + valore });

    const h = quando.getHours();
    const po = perOra.get(h) ?? { incassoCents: 0, ordini: 0 };
    perOra.set(h, { ...po, incassoCents: po.incassoCents + valore });

    const gs = giornoSettimana(quando);
    const ps = perSettimana.get(gs) ?? { incassoCents: 0, ordini: 0 };
    perSettimana.set(gs, { ...ps, incassoCents: ps.incassoCents + valore });

    const p = prodotti.get(r.name) ?? { pezzi: 0, incassoCents: 0 };
    prodotti.set(r.name, {
      pezzi: p.pezzi + r.quantity,
      incassoCents: p.incassoCents + valore,
    });

    const cat = (r.productId && categoriaDi.get(r.productId)) || "Senza categoria";
    const c = categorie.get(cat) ?? { pezzi: 0, incassoCents: 0 };
    categorie.set(cat, {
      pezzi: c.pezzi + r.quantity,
      incassoCents: c.incassoCents + valore,
    });
  }

  // Gli ordini si contano una volta sola, non per riga.
  for (const o of os) {
    const g = giornoISO(o.createdAt);
    const pg = perGiorno.get(g) ?? vuotoGiorno;
    perGiorno.set(g, { ...pg, ordini: pg.ordini + 1 });

    const h = o.createdAt.getHours();
    const po = perOra.get(h) ?? { incassoCents: 0, ordini: 0 };
    perOra.set(h, { ...po, ordini: po.ordini + 1 });

    const gs = giornoSettimana(o.createdAt);
    const ps = perSettimana.get(gs) ?? { incassoCents: 0, ordini: 0 };
    perSettimana.set(gs, { ...ps, ordini: ps.ordini + 1 });

    const cella = `${gs}:${h}`;
    affluenza.set(cella, (affluenza.get(cella) ?? 0) + 1);
  }

  // Le persone servite si sanno alla chiusura del tavolo, quindi si appoggiano
  // al giorno in cui il tavolo e' stato archiviato.
  for (const c of chiusure) {
    const g = giornoISO(c.closedAt);
    const pg = perGiorno.get(g) ?? vuotoGiorno;
    perGiorno.set(g, {
      ...pg,
      coperti: pg.coperti + c.partySize,
      tavoli: pg.tavoli + 1,
    });
  }

  // Un giorno senza ordini deve comparire vuoto, non sparire: un buco nel
  // grafico dice piu' di una barra mancante.
  const giorni: Analytics["perGiorno"] = [];
  for (
    let d = new Date(periodo.da.getFullYear(), periodo.da.getMonth(), periodo.da.getDate());
    d < periodo.a;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const g = giornoISO(d);
    giorni.push({ giorno: g, ...(perGiorno.get(g) ?? vuotoGiorno) });
  }

  // Cosa il locale tiene a menu e nessuno ordina. Si guardano solo i prodotti
  // disponibili: uno segnato esaurito non e' invenduto, e' assente.
  const aListino = await db
    .select({
      id: menuProducts.id,
      nome: menuProducts.name,
      priceCents: menuProducts.priceCents,
      categoria: menuCategories.name,
    })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .where(
      and(eq(menuProducts.tenantId, tenantId), eq(menuProducts.available, true))
    );

  const venduti = new Set(
    righe.filter((r) => r.voidedAt === null).map((r) => r.productId)
  );
  const maiOrdinati = aListino
    .filter((p) => !venduti.has(p.id))
    .map((p) => ({
      nome: p.nome,
      categoria: p.categoria,
      priceCents: p.priceCents,
    }))
    .sort((a, b) => b.priceCents - a.priceCents);

  // Stesso numero di giorni, subito prima: e' l'unico confronto onesto.
  const durata = periodo.a.getTime() - periodo.da.getTime();
  const precedente = await getTotali(tenantId, {
    da: new Date(periodo.da.getTime() - durata),
    a: periodo.da,
  });

  return {
    incassoCents,
    incassatoCents,
    coperti,
    copertoCents,
    ordini: os.length,
    tavoliChiusi: chiusure.length,
    pezzi,
    scontrinoMedioCents:
      coperti > 0 ? Math.round(incassoChiusiCents / coperti) : 0,
    consumazioniCents: incassoCents - copertoCents,
    perGiorno: giorni,
    perOra: [...perOra.entries()]
      .map(([ora, v]) => ({ ora, ...v }))
      .sort((a, b) => a.ora - b.ora),
    perGiornoSettimana: Array.from({ length: 7 }, (_, g) => ({
      giorno: g,
      ...(perSettimana.get(g) ?? { incassoCents: 0, ordini: 0 }),
    })),
    affluenza: [...affluenza.entries()].map(([k, ordini]) => {
      const [g, o] = k.split(":").map(Number);
      return { giorno: g, ora: o, ordini };
    }),
    topProdotti: classifica(prodotti, 10),
    topCategorie: classifica(categorie, 8),
    annullati: classifica(annullati, 5),
    maiOrdinati,
    prodottiAListino: aListino.length,
    richieste: richieste.sort((a, b) => +b.quando - +a.quando).slice(0, 20),
    precedente,
  };
}
