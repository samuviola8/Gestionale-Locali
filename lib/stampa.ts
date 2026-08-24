import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuProducts,
  orderItems,
  orders,
  printJobs,
  reparti,
  tenants,
} from "@/lib/db/schema";
import { getChannel, type Channel } from "@/lib/channels";
import { etichettaTavoli } from "@/lib/format";
import { sedutaDi, seduteAperte } from "@/lib/sedute";

// Comande e scontrini. Il contenuto si congela qui dentro: una ristampa deve
// mostrare quello che era stato mandato in cucina, non l'ordine com'e'
// diventato dopo un annullamento o una correzione di prezzo.

export type ComandaPayload = {
  kind: "comanda";
  reparto: string | null;
  canale: Channel;
  intestazione: string;
  // Aggiunta a un ordine gia' partito: il cliente ha richiamato per un altro
  // piatto. Va detto sul foglio, o in cucina rifanno tutto da capo.
  aggiunta?: boolean;
  // Quando va consegnato o ritirato, se il cliente l'ha chiesto.
  dueAt: string | null;
  indirizzo: string | null;
  telefono: string | null;
  quando: string;
  voci: {
    quantity: number;
    name: string;
    note: string | null;
    // Quanti calici portare con la bottiglia. Nullo o 0 = non se ne porta
    // nessuno: o il prodotto non li chiede, o li hanno gia' in tavolo.
    calici?: number | null;
    alias: string | null;
  }[];
};

export type ContoPayload = {
  kind: "conto";
  intestazione: string;
  quando: string;
  righe: { descrizione: string; importoCents: number }[];
  totaleCents: number;
  nota: string;
};

export type Payload = ComandaPayload | ContoPayload;

// Quale reparto prepara ogni prodotto, seguendo la categoria.
export async function repartoPerProdotto(
  tenantId: string,
  productIds: string[]
): Promise<Map<string, string | null>> {
  if (!productIds.length) return new Map();
  const righe = await db
    .select({ id: menuProducts.id, repartoId: menuCategories.repartoId })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .where(
      and(
        eq(menuProducts.tenantId, tenantId),
        inArray(menuProducts.id, productIds)
      )
    );
  return new Map(righe.map((r) => [r.id, r.repartoId]));
}

function orario(d: Date): string {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

// Il momento concordato porta con se' il giorno quando non e' oggi: una
// comanda che dice solo "per le 20:30" fa preparare stasera una cosa che il
// cliente viene a prendere domani.
function quandoRitira(d: Date): string {
  const oggi = new Date();
  const stesso =
    d.getFullYear() === oggi.getFullYear() &&
    d.getMonth() === oggi.getMonth() &&
    d.getDate() === oggi.getDate();
  if (stesso) return orario(d);
  return `${d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })} alle ${orario(d)}`;
}

// Crea i lavori di stampa per un ordine appena inviato: uno per reparto, piu'
// uno generico per le voci che non hanno un reparto assegnato. Separarli e'
// il punto: la pizzeria non deve leggere i cocktail per trovare le sue pizze.
export async function creaComande(
  tenantId: string,
  orderId: string,
  // Forzatura dell'operatore: acceso o spento a mano per questo ordine, invece
  // di seguire l'impostazione del canale. Undefined = decide l'impostazione.
  forza?: boolean,
  // Solo queste righe, invece di tutto l'ordine. Serve a chi aggiunge un
  // piatto a un ordine gia' partito: ristampare tutto vorrebbe dire farlo
  // rifare da capo in cucina.
  soloVoci?: string[]
): Promise<number> {
  const o = (
    await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
      .limit(1)
  )[0];
  if (!o) return 0;

  const impostazioni = (
    await db
      .select({
        tavolo: tenants.printComandaTavolo,
        banco: tenants.printComandaBanco,
        asporto: tenants.printComandaAsporto,
        domicilio: tenants.printComandaDomicilio,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
  )[0];
  if (!impostazioni) return 0;

  const daImpostazioni =
    o.channel === "tavolo"
      ? impostazioni.tavolo
      : o.channel === "banco"
        ? impostazioni.banco
        : o.channel === "asporto"
          ? impostazioni.asporto
          : impostazioni.domicilio;
  if (!(forza ?? daImpostazioni)) return 0;

  const tutte = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.voidedAt)));
  const voci = soloVoci
    ? tutte.filter((v) => soloVoci.includes(v.id))
    : tutte;
  if (!voci.length) return 0;

  const nomi = new Map(
    (
      await db
        .select({ id: reparti.id, name: reparti.name })
        .from(reparti)
        .where(eq(reparti.tenantId, tenantId))
    ).map((r) => [r.id, r.name])
  );

  const canale = getChannel(o.channel);
  // Su due tavoli accostati la comanda porta tutti e due i numeri: il conto e'
  // sul capofila, ma chi arriva col vassoio cerca il tavolo, e il gruppo sta
  // di la' e di qua.
  const seduta =
    o.channel === "tavolo" && o.tableNumber !== null
      ? sedutaDi(await seduteAperte(tenantId), o.tableNumber)
      : null;
  const intestazione =
    o.channel === "tavolo"
      ? (etichettaTavoli(seduta?.tavoli ?? [o.tableNumber ?? 0]) ??
        `Tavolo ${o.tableNumber}`)
      : o.customerName
        ? `${canale.singolare} · ${o.customerName}`
        : canale.singolare;

  // Raggruppate per reparto; la chiave vuota sono le voci senza reparto.
  const perReparto = new Map<string, typeof voci>();
  for (const v of voci) {
    const k = v.repartoId ?? "";
    if (!perReparto.has(k)) perReparto.set(k, []);
    perReparto.get(k)!.push(v);
  }

  const lavori = [...perReparto.entries()].map(([repartoId, righe]) => ({
    tenantId,
    repartoId: repartoId || null,
    orderId,
    kind: "comanda",
    payload: {
      kind: "comanda",
      reparto: repartoId ? (nomi.get(repartoId) ?? null) : null,
      canale: o.channel as Channel,
      intestazione,
      aggiunta: !!soloVoci,
      dueAt: o.dueAt ? quandoRitira(o.dueAt) : null,
      indirizzo: o.customerAddress,
      telefono: o.customerPhone,
      quando: orario(o.createdAt),
      voci: righe.map((r) => ({
        quantity: r.quantity,
        name: r.name,
        note: r.note,
        calici: r.glasses,
        alias: o.channel === "tavolo" ? r.alias : null,
      })),
    } satisfies ComandaPayload,
  }));

  await db.insert(printJobs).values(lavori);
  return lavori.length;
}

// Scontrino di un ordine di cassa. Non passa da loadOpenTables perche' un
// ordine al banco si chiude nello stesso istante in cui nasce, e quando lo si
// stampa fra i conti aperti non c'e' gia' piu'.
export async function creaScontrinoOrdine(
  tenantId: string,
  orderId: string
): Promise<void> {
  const o = (
    await db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
      .limit(1)
  )[0];
  if (!o) return;

  const voci = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), isNull(orderItems.voidedAt)));

  const canale = getChannel(o.channel);
  const righe: ContoPayload["righe"] = voci.map((v) => ({
    descrizione: `${v.quantity}× ${v.name}`,
    importoCents: v.priceCents * v.quantity,
  }));
  if (o.deliveryFeeCents > 0) {
    righe.push({ descrizione: "Consegna", importoCents: o.deliveryFeeCents });
  }

  await db.insert(printJobs).values({
    tenantId,
    repartoId: null,
    orderId,
    kind: "conto",
    payload: {
      kind: "conto",
      intestazione: o.customerName
        ? `${canale.singolare} · ${o.customerName}`
        : canale.singolare,
      quando: new Date().toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      righe,
      totaleCents: righe.reduce((s, r) => s + r.importoCents, 0),
      nota: "Riepilogo. Lo scontrino fiscale lo emette la cassa.",
    } satisfies ContoPayload,
  });
}

// Scontrino del conto: quello che il cliente guarda prima di pagare. Non e' un
// documento fiscale — quello lo emette la cassa — ed e' scritto sul foglio,
// perche' un pezzo di carta senza scritte sopra si scambia per una ricevuta.
export async function creaScontrinoConto(
  tenantId: string,
  conto: {
    label: string;
    people: {
      alias: string;
      items: { name: string; quantity: number; priceCents: number; voided?: boolean }[];
      itemsTotal: number;
      shares: { label: string; amountCents: number }[];
      coverCharge: number;
      total: number;
    }[];
    shared: {
      alias: string;
      items: { name: string; quantity: number; priceCents: number; voided?: boolean }[];
    }[];
    deliveryFeeCents: number;
    total: number;
  }
): Promise<void> {
  const righe: ContoPayload["righe"] = [];

  for (const p of conto.people) {
    // Con una persona sola l'intestazione sarebbe rumore: le voci parlano
    // gia' da sole.
    if (conto.people.length > 1) {
      righe.push({ descrizione: p.alias.toUpperCase(), importoCents: p.total });
    }
    for (const i of p.items) {
      if (i.voided) continue;
      righe.push({
        descrizione: `  ${i.quantity}× ${i.name}`,
        importoCents: i.priceCents * i.quantity,
      });
    }
    // Una quota per ogni gruppo a cui partecipa: sommarle in una riga sola
    // lascerebbe il cliente a chiedersi da dove esce quella cifra.
    for (const q of p.shares) {
      righe.push({ descrizione: `  ${q.label}`, importoCents: q.amountCents });
    }
    if (p.coverCharge > 0) {
      righe.push({ descrizione: "  Coperto", importoCents: p.coverCharge });
    }
  }

  for (const g of conto.shared) {
    for (const i of g.items) {
      if (i.voided) continue;
      righe.push({
        descrizione: `${g.alias}: ${i.quantity}× ${i.name}`,
        importoCents: i.priceCents * i.quantity,
      });
    }
  }

  if (conto.deliveryFeeCents > 0) {
    righe.push({ descrizione: "Consegna", importoCents: conto.deliveryFeeCents });
  }

  await db.insert(printJobs).values({
    tenantId,
    repartoId: null,
    kind: "conto",
    payload: {
      kind: "conto",
      intestazione: conto.label,
      quando: new Date().toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      righe,
      totaleCents: conto.total,
      nota: "Riepilogo del conto. Lo scontrino fiscale lo emette la cassa.",
    } satisfies ContoPayload,
  });
}
