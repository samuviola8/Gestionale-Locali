import { and, asc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  orders,
  reservations,
  restaurantTables,
  tableSessions,
  waiterCalls,
} from "@/lib/db/schema";
import { loadOpenTables } from "@/lib/bill-query";
import { seduteAperte, type Seduta } from "@/lib/sedute";
import type { ModuleState } from "@/lib/modules";
import type { OrigineOccupazione } from "@/lib/format";

// La sala vista dall'alto: quali tavoli sono occupati, da quanto, e da chi.
//
// Serve a una domanda che durante il servizio nessuna pagina sapeva rispondere:
// «quel tavolo da quanto e' li'?». I conti aperti dicono cosa si e' consumato,
// la coda dice cosa manca da preparare, ma il tempo — che e' quello che decide
// se la comitiva delle nove trova posto — non lo diceva nessuno.

// Un gruppo seduto: uno o piu' tavoli, un conto solo.
export type GruppoInSala = {
  // Il tavolo su cui sta il conto.
  capofila: number;
  tavoli: number[];
  // Da quando c'e' gente. Null non capita mai su un gruppo vivo: e' qui solo
  // perche' il tipo lo permetta a chi costruisce il gruppo prima di saperlo.
  da: Date | null;
  origine: OrigineOccupazione;
  persone: number;
  totaleCents: number;
  daIncassareCents: number;
  // La chiave del conto, per mandare chi guarda direttamente a incassarlo.
  contoKey: string | null;
  // Ha ordinato qualcosa che non e' ancora uscito.
  inPreparazione: boolean;
  chiamata: boolean;
  daPrenotazione: boolean;
};

export type ProssimoArrivo = {
  alle: Date;
  nome: string;
  persone: number;
};

export type TavoloInSala = {
  numero: number;
  posti: number;
  gruppo: GruppoInSala | null;
  // Chi ha prenotato questo tavolo per piu' tardi. Vale anche sui tavoli
  // occupati: e' li' che serve, perche' dice entro quando va liberato.
  prossimo: ProssimoArrivo | null;
};

export type Sala = {
  tavoli: TavoloInSala[];
  gruppi: GruppoInSala[];
  occupati: number;
  liberi: number;
  copertiSeduti: number;
};

function piuVecchia(date: (Date | null | undefined)[]): Date | null {
  const valide = date.filter((d): d is Date => !!d);
  if (!valide.length) return null;
  return valide.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

export async function statoSala(
  tenantId: string,
  modules: ModuleState,
  adesso: Date = new Date()
): Promise<Sala> {
  const [tavoli, sedute, conti, ordiniAperti, sessioni, chiamate] =
    await Promise.all([
      db
        .select({
          numero: restaurantTables.number,
          posti: restaurantTables.seats,
        })
        .from(restaurantTables)
        .where(eq(restaurantTables.tenantId, tenantId))
        .orderBy(asc(restaurantTables.number)),
      seduteAperte(tenantId),
      loadOpenTables(tenantId),
      db
        .select({
          tableNumber: orders.tableNumber,
          createdAt: orders.createdAt,
          partySize: orders.partySize,
        })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, tenantId),
            eq(orders.channel, "tavolo"),
            isNull(orders.closedAt)
          )
        ),
      // Una sessione ancora buona vuol dire che qualcuno ha inquadrato il QR e
      // il conto non e' mai stato chiuso: e' il segnale piu' debole dei tre,
      // ma e' l'unico che si ha di chi si e' seduto e sta ancora leggendo.
      db
        .select({
          tableNumber: tableSessions.tableNumber,
          createdAt: tableSessions.createdAt,
        })
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.tenantId, tenantId),
            isNull(tableSessions.revokedAt),
            gt(tableSessions.expiresAt, adesso)
          )
        ),
      db
        .select({ tableNumber: waiterCalls.tableNumber })
        .from(waiterCalls)
        .where(
          and(
            eq(waiterCalls.tenantId, tenantId),
            isNull(waiterCalls.resolvedAt)
          )
        ),
    ]);

  // Chi arriva nelle prossime ore, tavolo per tavolo. Senza le prenotazioni
  // attive non c'e' niente da chiedere al database.
  const prenotate = modules.reservations
    ? await db
        .select({
          startsAt: reservations.startsAt,
          customerName: reservations.customerName,
          partySize: reservations.partySize,
          tableNumbers: reservations.tableNumbers,
        })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, tenantId),
            gte(reservations.startsAt, new Date(adesso.getTime() - 15 * 60000)),
            lt(reservations.startsAt, new Date(adesso.getTime() + 12 * 3600000)),
            inArray(reservations.status, ["pending", "confirmed", "proposed"])
          )
        )
        .orderBy(asc(reservations.startsAt))
    : [];

  const primoOrdine = new Map<number, Date>();
  // Quante persone hanno detto di essere. E' l'unico numero non indovinato che
  // esiste, e vince su tutti gli altri.
  const dichiarate = new Map<number, number>();
  for (const o of ordiniAperti) {
    if (o.tableNumber === null) continue;
    const gia = primoOrdine.get(o.tableNumber);
    if (!gia || o.createdAt < gia) primoOrdine.set(o.tableNumber, o.createdAt);
    if (o.partySize) {
      dichiarate.set(
        o.tableNumber,
        Math.max(dichiarate.get(o.tableNumber) ?? 0, o.partySize)
      );
    }
  }

  const postiDi = new Map(tavoli.map((t) => [t.numero, t.posti]));

  const primaScansione = new Map<number, Date>();
  for (const s of sessioni) {
    const gia = primaScansione.get(s.tableNumber);
    if (!gia || s.createdAt < gia) primaScansione.set(s.tableNumber, s.createdAt);
  }

  const conChiamata = new Set(chiamate.map((c) => c.tableNumber));
  const contoDi = new Map(
    conti.filter((c) => c.channel === "tavolo").map((c) => [c.tableNumber, c])
  );

  const prossimoDi = new Map<number, ProssimoArrivo>();
  for (const p of prenotate) {
    for (const n of p.tableNumbers) {
      if (prossimoDi.has(n)) continue;
      prossimoDi.set(n, {
        alle: p.startsAt,
        nome: p.customerName,
        persone: p.partySize,
      });
    }
  }

  // I gruppi: prima quelli scritti dalla sala, poi i tavoli che risultano
  // occupati per conto loro — chi ha ordinato senza che nessuno abbia aperto
  // niente, e chi ha solo scansionato.
  const gruppi: GruppoInSala[] = [];
  const assegnati = new Set<number>();

  function componi(
    capofila: number,
    tavoliGruppo: number[],
    seduta: Seduta | null,
    origine: OrigineOccupazione
  ): GruppoInSala {
    const conto = contoDi.get(capofila) ?? null;
    return {
      capofila,
      tavoli: tavoliGruppo,
      da: piuVecchia([
        seduta?.apertaAlle,
        primoOrdine.get(capofila),
        ...tavoliGruppo.map((n) => primaScansione.get(n)),
      ]),
      origine,
      // Quante persone. Prima quello che hanno dichiarato loro ordinando, poi
      // quello che ha contato la sala; se nessuno ha detto niente valgono i
      // posti dei tavoli — due tavoli accostati da due e da quattro fanno sei,
      // che e' la risposta giusta quasi sempre e comunque meglio di un trattino.
      // Non si conta chi ha ordinato a proprio nome: al tavolo da sei ordinano
      // in due, e «2 persone» sarebbe un numero sbagliato scritto con sicurezza.
      persone:
        dichiarate.get(capofila) ??
        seduta?.persone ??
        tavoliGruppo.reduce((s, n) => s + (postiDi.get(n) ?? 0), 0),
      totaleCents: conto?.total ?? 0,
      daIncassareCents: conto ? Math.max(0, conto.total - conto.incassato) : 0,
      contoKey: conto?.key ?? null,
      inPreparazione: conto?.hasPending ?? false,
      chiamata: tavoliGruppo.some((n) => conChiamata.has(n)),
      daPrenotazione: seduta?.daPrenotazione ?? false,
    };
  }

  for (const s of sedute) {
    gruppi.push(
      componi(
        s.capofila,
        s.tavoli,
        s,
        contoDi.has(s.capofila) ? "ordine" : "sala"
      )
    );
    for (const n of s.tavoli) assegnati.add(n);
  }

  for (const t of tavoli) {
    if (assegnati.has(t.numero)) continue;
    const haConto = contoDi.has(t.numero) || primoOrdine.has(t.numero);
    const haScansione = primaScansione.has(t.numero);
    if (!haConto && !haScansione) continue;

    gruppi.push(componi(t.numero, [t.numero], null, haConto ? "ordine" : "qr"));
    assegnati.add(t.numero);
  }

  const gruppoDi = new Map<number, GruppoInSala>();
  for (const g of gruppi) {
    for (const n of g.tavoli) gruppoDi.set(n, g);
  }

  const inSala: TavoloInSala[] = tavoli.map((t) => ({
    numero: t.numero,
    posti: t.posti,
    gruppo: gruppoDi.get(t.numero) ?? null,
    prossimo: prossimoDi.get(t.numero) ?? null,
  }));

  const occupati = inSala.filter((t) => t.gruppo).length;

  return {
    tavoli: inSala,
    // Dal piu' vecchio: chi e' seduto da due ore e' quello di cui si vuole
    // sapere qualcosa, non l'ultimo arrivato.
    gruppi: [...gruppi].sort(
      (a, b) => (a.da?.getTime() ?? 0) - (b.da?.getTime() ?? 0)
    ),
    occupati,
    liberi: inSala.length - occupati,
    copertiSeduti: gruppi.reduce((s, g) => s + g.persone, 0),
  };
}
