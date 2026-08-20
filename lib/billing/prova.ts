import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billSettlements,
  customers,
  orderItems,
  orders,
  reservations,
  waiterCalls,
} from "@/lib/db/schema";
import { getModule, type ModuleKey } from "@/lib/modules";
import { PACCHETTI, type Pacco } from "@/lib/billing/listino";

// Cosa ha davvero usato il locale durante la prova.
//
// Serve al momento in cui la prova finisce e deve scegliere. Un elenco di
// pacchetti da solo non lo aiuta: non si ricorda se le prenotazioni le ha
// usate o se le ha solo viste. Questi numeri sono la risposta, e sono suoi —
// non una previsione mia.
//
// E' anche il motivo per cui il consiglio che diamo si puo' difendere: "hai
// preso 34 prenotazioni, quindi ti serve Locale" e' un argomento; "ti
// consigliamo Locale" e' una vendita.

export type VoceUso = {
  key: ModuleKey;
  label: string;
  quante: number;
  /** Come si contano: "ordini al tavolo", "prenotazioni". */
  unita: string;
};

export type UsoInProva = {
  giorni: number;
  ordini: number;
  incassoCents: number;
  /** Solo quello che ha numeri sopra lo zero, dal piu' usato. */
  voci: VoceUso[];
  moduliUsati: ModuleKey[];
  /** Il pacchetto piu' piccolo che copre quello che ha usato. */
  paccoConsigliato: Pacco["key"] | null;
};

export async function usoInProva(
  tenantId: string,
  da: Date
): Promise<UsoInProva> {
  const [righeOrdini, incasso, prenotazioni, chiamate, sottoconti, rubrica] =
    await Promise.all([
      // Gli ordini divisi per canale: e' il canale che dice quale modulo ha
      // usato davvero, non il modulo acceso.
      db
        .select({
          channel: orders.channel,
          quanti: sql<number>`count(*)::int`,
        })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, da)))
        .groupBy(orders.channel),
      db
        .select({
          tot: sql<number>`coalesce(sum(${orderItems.priceCents} * ${orderItems.quantity}), 0)::int`,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(
          and(
            eq(orders.tenantId, tenantId),
            gte(orders.createdAt, da),
            eq(orderItems.paid, true)
          )
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(reservations)
        .where(
          and(eq(reservations.tenantId, tenantId), gte(reservations.createdAt, da))
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(waiterCalls)
        .where(
          and(eq(waiterCalls.tenantId, tenantId), gte(waiterCalls.createdAt, da))
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(billSettlements)
        .where(
          and(
            eq(billSettlements.tenantId, tenantId),
            gte(billSettlements.createdAt, da)
          )
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(customers)
        .where(and(eq(customers.tenantId, tenantId), gte(customers.createdAt, da))),
    ]);

  const perCanale = new Map(righeOrdini.map((r) => [r.channel, r.quanti]));
  const ordini = righeOrdini.reduce((s, r) => s + r.quanti, 0);

  const candidate: { key: ModuleKey; quante: number; unita: string }[] = [
    { key: "qr_ordering", quante: perCanale.get("tavolo") ?? 0, unita: "ordini al tavolo" },
    { key: "counter_orders", quante: perCanale.get("banco") ?? 0, unita: "ordini al banco" },
    { key: "takeaway", quante: perCanale.get("asporto") ?? 0, unita: "ordini d'asporto" },
    { key: "delivery", quante: perCanale.get("domicilio") ?? 0, unita: "consegne" },
    { key: "reservations", quante: prenotazioni[0]?.n ?? 0, unita: "prenotazioni" },
    { key: "waiter_call", quante: chiamate[0]?.n ?? 0, unita: "chiamate dal tavolo" },
    { key: "split_bill", quante: sottoconti[0]?.n ?? 0, unita: "conti divisi" },
    { key: "customers", quante: rubrica[0]?.n ?? 0, unita: "clienti in rubrica" },
  ];

  const voci = candidate
    .filter((c) => c.quante > 0)
    .sort((a, b) => b.quante - a.quante)
    .map((c) => ({ ...c, label: getModule(c.key).label }));

  const moduliUsati = voci.map((v) => v.key);

  // Il pacchetto piu' piccolo che copre tutto quello che ha usato. Se non ce
  // n'e' nessuno che basta — usa moduli che stanno solo negli add-on — resta
  // null e la pagina non consiglia niente invece di consigliare a caso.
  const paccoConsigliato =
    PACCHETTI.find((p) => moduliUsati.every((k) => p.moduli.includes(k)))?.key ??
    null;

  const giorni = Math.max(
    1,
    Math.round((Date.now() - da.getTime()) / 86400000)
  );

  return {
    giorni,
    ordini,
    incassoCents: incasso[0]?.tot ?? 0,
    voci,
    moduliUsati,
    paccoConsigliato,
  };
}

/** Quanti giorni mancano alla fine della prova. Negativo = e' gia' finita. */
export function giorniAllaFine(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  return Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000);
}
