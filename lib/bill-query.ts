import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { billSettlements, orderItems, orders, tenants } from "@/lib/db/schema";
import {
  ALIAS_CONDIVISO,
  buildTable,
  eGruppo,
  membriDi,
  type BillLine,
  type BillTable,
} from "@/lib/bill";
import { getChannel } from "@/lib/channels";
import { etichettaTavoli } from "@/lib/format";
import { capofila, sedutaDi, seduteAperte, type Seduta } from "@/lib/sedute";

// Come si chiama il conto di un tavolo: "Tavolo 3", o "Tavoli 4+5" se sono
// accostati. Chi incassa deve leggere in un colpo d'occhio quanti tavoli sta
// chiudendo, altrimenti va a liberarne uno e lascia l'altro apparecchiato.
function etichettaConto(sedute: Seduta[], tableNumber: number): string {
  const seduta = sedutaDi(sedute, tableNumber);
  return etichettaTavoli(seduta?.tavoli ?? [tableNumber]) ?? `Tavolo ${tableNumber}`;
}

// Carica i conti aperti di un locale. Sta a parte dalla route perche' lo usa
// anche l'incasso: il totale da congelare dev'essere calcolato con le stesse
// regole che il cassiere vede a schermo.
//
// In sala il conto e' il tavolo e raccoglie tutti gli ordini di quel tavolo.
// Fuori dalla sala il conto e' il singolo ordine: due asporti in coda sono due
// conti distinti, e appoggiarli a un numero di tavolo inventato li mescolerebbe.
export async function loadOpenTables(
  tenantId: string,
  onlyTable?: number
): Promise<BillTable[]> {
  const tenant = (
    await db
      .select({ coverChargeCents: tenants.coverChargeCents })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
  )[0];
  const coverChargeCents = tenant?.coverChargeCents ?? 0;

  // I tavoli accostati fanno un conto solo, intestato al capofila. Chi chiede
  // il conto del tavolo unito chiede quello del gruppo: e' la stessa gente,
  // seduta allo stesso tavolo lungo.
  const sedute = await seduteAperte(tenantId);
  const filtro =
    onlyTable === undefined
      ? undefined
      : (sedutaDi(sedute, onlyTable)?.capofila ?? onlyTable);

  const os = await db
    .select({
      id: orders.id,
      tableNumber: orders.tableNumber,
      channel: orders.channel,
      status: orders.status,
      partySize: orders.partySize,
      customerName: orders.customerName,
      customerPhone: orders.customerPhone,
      customerAddress: orders.customerAddress,
      deliveryFeeCents: orders.deliveryFeeCents,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        isNull(orders.closedAt),
        // Un ordine dal web che il locale non ha ancora accettato non e' un
        // conto: non e' stato preparato niente e non c'e' niente da incassare.
        ne(orders.status, "pending")
      )
    )
    .orderBy(asc(orders.createdAt));

  // Il filtro per tavolo serve alla pagina cliente, che vive in sala: gli
  // ordini senza tavolo non la riguardano.
  const wanted =
    filtro === undefined
      ? os
      : os.filter((o) => o.channel === "tavolo" && o.tableNumber === filtro);
  const ids = wanted.map((o) => o.id);
  if (!ids.length) return [];

  const its = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));

  const settlements = await db
    .select({
      tableNumber: billSettlements.tableNumber,
      alias: billSettlements.alias,
      amountCents: billSettlements.amountCents,
    })
    .from(billSettlements)
    .where(eq(billSettlements.tenantId, tenantId));

  // Un ordine annullato per intero non e' piu' "in corso": non arrivera' mai
  // niente, e segnalarlo bloccherebbe la chiusura del tavolo per nulla.
  const conRigheVive = new Set(
    its.filter((i) => i.voidedAt === null).map((i) => i.orderId)
  );

  // Chiave del conto a cui appartiene ogni ordine.
  function chiaveDi(o: (typeof wanted)[number]): string {
    return o.channel === "tavolo" ? `t:${o.tableNumber ?? 0}` : `o:${o.id}`;
  }

  type Conto = {
    key: string;
    channel: string;
    label: string;
    tableNumber: number;
    orderId: string | null;
    customerName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    deliveryFeeCents: number;
    partySize: number;
    pending: boolean;
    byAlias: Map<string, BillLine[]>;
  };

  const conti = new Map<string, Conto>();

  for (const o of wanted) {
    const key = chiaveDi(o);
    const canale = getChannel(o.channel);
    const esistente = conti.get(key);

    if (!esistente) {
      conti.set(key, {
        key,
        channel: o.channel,
        label:
          o.channel === "tavolo"
            ? etichettaConto(sedute, o.tableNumber ?? 0)
            : o.customerName
              ? `${canale.singolare} · ${o.customerName}`
              : canale.singolare,
        tableNumber: o.tableNumber ?? 0,
        orderId: o.channel === "tavolo" ? null : o.id,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerAddress: o.customerAddress,
        deliveryFeeCents: o.deliveryFeeCents,
        partySize: o.partySize ?? 0,
        pending: false,
        byAlias: new Map(),
      });
    }

    const c = conti.get(key)!;
    // Se due telefoni dichiarano numeri diversi si tiene il maggiore, cosi'
    // nessuno resta senza coperto.
    if (o.partySize) c.partySize = Math.max(c.partySize, o.partySize);
    if (
      (o.status === "new" || o.status === "preparing") &&
      conRigheVive.has(o.id)
    ) {
      c.pending = true;
    }
  }

  const contoDiOrdine = new Map(wanted.map((o) => [o.id, chiaveDi(o)]));

  for (const it of its) {
    const key = contoDiOrdine.get(it.orderId);
    if (key === undefined) continue;
    const c = conti.get(key);
    if (!c) continue;
    const alias = it.alias ?? "Tavolo";
    if (!c.byAlias.has(alias)) c.byAlias.set(alias, []);
    c.byAlias.get(alias)!.push({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      priceCents: it.priceCents,
      paid: it.paid,
      note: it.note,
      priceAdjusted: it.priceAdjusted,
      voided: it.voidedAt !== null,
    });
  }

  // Gli incassi parziali esistono solo dove si divide il conto, cioe' in sala:
  // sono registrati per numero di tavolo.
  const settledByTable = new Map<number, Map<string, number>>();
  for (const s of settlements) {
    if (!settledByTable.has(s.tableNumber)) {
      settledByTable.set(s.tableNumber, new Map());
    }
    settledByTable.get(s.tableNumber)!.set(s.alias, s.amountCents);
  }

  return [...conti.values()]
    .map((c) => {
      const inSala = c.channel === "tavolo";
      return buildTable({
        key: c.key,
        channel: c.channel,
        label: c.label,
        tableNumber: c.tableNumber,
        orderId: c.orderId,
        customerName: c.customerName,
        customerPhone: c.customerPhone,
        customerAddress: c.customerAddress,
        deliveryFeeCents: c.deliveryFeeCents,
        byAlias: c.byAlias,
        declaredPartySize: inSala ? c.partySize || null : null,
        // Il coperto si paga per stare seduti: al banco, in asporto e a
        // domicilio nessuno e' seduto.
        coverChargeCents: inSala ? coverChargeCents : 0,
        settled: inSala
          ? (settledByTable.get(c.tableNumber) ?? new Map())
          : new Map(),
        hasPending: c.pending,
      });
    })
    // Prima la sala in ordine di tavolo, poi gli altri canali.
    .sort((a, b) => {
      if (a.channel !== b.channel) {
        if (a.channel === "tavolo") return -1;
        if (b.channel === "tavolo") return 1;
        return a.channel.localeCompare(b.channel);
      }
      return a.tableNumber - b.tableNumber || a.label.localeCompare(b.label);
    });
}

// Chi e' seduto adesso a un tavolo, cioe' i nomi che compaiono sugli ordini
// ancora aperti. Non c'e' un elenco dei presenti da nessuna parte: al tavolo
// nessuno fa l'appello, e l'unica traccia di chi c'e' e' quello che ha
// ordinato. Un alias di gruppo vale per le persone che nomina.
//
// La usano la pagina del cliente — che senza non saprebbe dei nomi scritti
// sugli altri telefoni — e quella del cameriere, che li propone da toccare
// invece di farglieli riscrivere.
export async function personeAlTavolo(
  tenantId: string,
  tableNumber: number
): Promise<string[]> {
  // Su due tavoli accostati la gente e' una sola: chi ordina dal tavolo di
  // fianco deve trovare gli stessi nomi, o dividerebbe con dei fantasmi.
  const tavolo = await capofila(tenantId, tableNumber);

  const os = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.tableNumber, tavolo),
        isNull(orders.closedAt)
      )
    );
  if (!os.length) return [];

  const its = await db
    .select({ alias: orderItems.alias })
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        os.map((o) => o.id)
      )
    );

  return [
    ...new Set(
      its.flatMap((i) => {
        const a = i.alias ?? "";
        if (!a || a === "Tavolo" || a === ALIAS_CONDIVISO) return [];
        return eGruppo(a) ? membriDi(a) : [a];
      })
    ),
  ];
}
