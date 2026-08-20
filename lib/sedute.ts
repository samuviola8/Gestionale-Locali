import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billSettlements,
  orderItems,
  orders,
  restaurantTables,
  tableSittings,
  waiterCalls,
} from "@/lib/db/schema";

// I tavoli uniti in sala.
//
// La prenotazione sa gia' accostare due tavoli per un gruppo che non entra in
// uno solo, ma la stessa cosa capita tutte le sere senza che nessuno abbia
// prenotato: arrivano in sei, il cameriere tira di fianco il tavolo libero, e
// da quel momento i due tavoli sono un tavolo solo.
//
// Unirli vuol dire due cose insieme, e servono tutte e due:
//
//   - risultano occupati entrambi, cosi' nessuno ci fa accomodare altra gente
//     e nessuno apre un secondo conto sul tavolo accostato;
//   - il conto e' uno solo. Sta sul capofila, e quello che si ordina dal QR
//     dell'altro tavolo ci finisce sopra da solo: al momento di pagare un
//     gruppo unico con due conti separati si dividerebbe a mano, che e'
//     esattamente il lavoro che il conto diviso doveva togliere.
//
// Una seduta di un tavolo solo e' legittima e serve: e' il modo per dire «qui
// c'e' gente» prima che ordinino. Fino alla prima consumazione il sistema, da
// solo, non puo' saperlo.

// Oltre gli otto tavoli accostati non c'e' piu' un tavolo, c'e' una sala
// riservata: lo stesso tetto della prenotazione, per la stessa ragione.
const MAX_TAVOLI = 8;

export type Seduta = {
  id: string;
  // I tavoli del gruppo, in ordine di numero.
  tavoli: number[];
  // Dove sta il conto.
  capofila: number;
  persone: number | null;
  apertaAlle: Date;
  reservationId: string | null;
  daPrenotazione: boolean;
};

type RigaSeduta = {
  id: string;
  tableNumbers: number[];
  mainTable: number;
  partySize: number | null;
  openedAt: Date;
  reservationId: string | null;
};

function leggi(r: RigaSeduta): Seduta {
  return {
    id: r.id,
    tavoli: [...r.tableNumbers].sort((a, b) => a - b),
    capofila: r.mainTable,
    persone: r.partySize,
    apertaAlle: r.openedAt,
    reservationId: r.reservationId,
    daPrenotazione: r.reservationId !== null,
  };
}

const COLONNE = {
  id: tableSittings.id,
  tableNumbers: tableSittings.tableNumbers,
  mainTable: tableSittings.mainTable,
  partySize: tableSittings.partySize,
  openedAt: tableSittings.openedAt,
  reservationId: tableSittings.reservationId,
};

// L'esecutore e' il database o una transazione aperta: aprire una seduta deve
// poter rileggere quelle in corso dentro la stessa transazione che poi scrive.
type Esecutore = Pick<typeof db, "select">;

// Le sedute in corso, dalla piu' vecchia. Sono poche — al massimo una per
// tavolo occupato — e si leggono tutte insieme: cercare un numero dentro una
// colonna array, tavolo per tavolo, costerebbe piu' del giro completo.
export async function seduteAperte(
  tenantId: string,
  esecutore: Esecutore = db
): Promise<Seduta[]> {
  const righe = await esecutore
    .select(COLONNE)
    .from(tableSittings)
    .where(
      and(eq(tableSittings.tenantId, tenantId), isNull(tableSittings.closedAt))
    )
    .orderBy(asc(tableSittings.openedAt));
  return righe.map(leggi);
}

export function sedutaDi(sedute: Seduta[], tavolo: number): Seduta | null {
  return sedute.find((s) => s.tavoli.includes(tavolo)) ?? null;
}

// La seduta nata da una prenotazione, finche' e' aperta. Serve a chi corregge
// i tavoli di un gruppo gia' arrivato: la sala deve seguire la correzione, non
// restare ferma su dove il sistema li aveva messi.
export async function sedutaDiPrenotazione(
  tenantId: string,
  reservationId: string
): Promise<Seduta | null> {
  const aperte = await seduteAperte(tenantId);
  return aperte.find((s) => s.reservationId === reservationId) ?? null;
}

// Dove finisce quello che si ordina da questo tavolo. Senza unione e' il
// tavolo stesso, ed e' il caso normale: la funzione esiste perche' chi crea un
// ordine non deve sapere niente delle sedute.
export async function capofila(
  tenantId: string,
  tavolo: number
): Promise<number> {
  const seduta = sedutaDi(await seduteAperte(tenantId), tavolo);
  return seduta ? seduta.capofila : tavolo;
}

export type EsitoSeduta =
  | { ok: true; capofila: number; tavoli: number[] }
  | { ok: false; errore: string };

// Apre una seduta, o allarga quella che c'e' gia'.
//
// Se qualcuno dei tavoli scelti sta gia' in un gruppo, quel gruppo si assorbe
// tutto: unire il 4 al 5 quando il 5 e' gia' accostato al 6 fa 4+5+6, perche'
// staccare il 6 da chi ci e' seduto sopra non e' una cosa da far succedere per
// sbaglio accostando un tavolo.
//
// Con `esatto` invece il gruppo diventa **esattamente** i tavoli chiesti, e
// quelli lasciati fuori si liberano. Serve a chi riscrive l'elenco dei tavoli
// di una prenotazione: li' togliere un tavolo dall'elenco vuol dire togliere
// quel tavolo, e vederlo restare occupato senza spiegazioni e' peggio che non
// poterlo togliere. Un tavolo con un conto aperto resta comunque nel gruppo:
// liberarlo spezzerebbe in due il conto di gente che paga insieme.
export async function apriSeduta(
  tenantId: string,
  numeri: number[],
  {
    persone,
    reservationId,
    esatto = false,
  }: {
    persone?: number | null;
    reservationId?: string | null;
    esatto?: boolean;
  } = {}
): Promise<EsitoSeduta> {
  const scelti = [
    ...new Set(numeri.filter((n) => Number.isInteger(n) && n > 0)),
  ].sort((a, b) => a - b);

  if (!scelti.length) return { ok: false, errore: "Scegli almeno un tavolo." };

  return db.transaction(async (tx) => {
    // Stesso lucchetto della prenotazione: due camerieri che accostano tavoli
    // nello stesso secondo leggerebbero la stessa sala libera.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`
    );

    const esistenti = (
      await tx
        .select({ number: restaurantTables.number })
        .from(restaurantTables)
        .where(eq(restaurantTables.tenantId, tenantId))
    ).map((t) => t.number);

    const mancante = scelti.find((n) => !esistenti.includes(n));
    if (mancante !== undefined) {
      return {
        ok: false as const,
        errore: `Il tavolo ${mancante} non esiste in questa sala.`,
      };
    }

    const aperte = await seduteAperte(tenantId, tx);
    const coinvolte = aperte.filter((s) =>
      s.tavoli.some((n) => scelti.includes(n))
    );
    // Tutti i tavoli in ballo: quelli chiesti piu' quelli dei gruppi che si
    // toccano. Gli ordini si leggono su tutti, perche' e' quello che dice
    // quali non si possono lasciare fuori.
    const candidati = [
      ...new Set([...scelti, ...coinvolte.flatMap((s) => s.tavoli)]),
    ].sort((a, b) => a - b);

    // Se c'e' gia' qualcosa di ordinato, il capofila e' il tavolo dove sta il
    // conto piu' vecchio: gli altri ordini si spostano li'. Sceglierne un
    // altro vorrebbe dire spostare piu' righe per lo stesso risultato.
    const ordiniAperti = await tx
      .select({
        id: orders.id,
        tableNumber: orders.tableNumber,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.channel, "tavolo"),
          isNull(orders.closedAt),
          inArray(orders.tableNumber, candidati)
        )
      )
      .orderBy(asc(orders.createdAt));

    const conConto = new Set(
      ordiniAperti
        .map((o) => o.tableNumber)
        .filter((n): n is number => n !== null)
    );

    const tavoli = esatto
      ? [...new Set([...scelti, ...candidati.filter((n) => conConto.has(n))])].sort(
          (a, b) => a - b
        )
      : candidati;

    if (tavoli.length > MAX_TAVOLI) {
      return {
        ok: false as const,
        errore: `Piu' di ${MAX_TAVOLI} tavoli accostati non e' piu' un tavolo: quello si concorda a voce.`,
      };
    }

    // Il capofila di prima vale solo se e' rimasto nel gruppo: riscrivendo i
    // tavoli puo' essere stato tolto, e il conto non puo' stare su un tavolo
    // che del gruppo non fa piu' parte.
    const vecchioCapo = coinvolte[0]?.capofila;
    const capo =
      ordiniAperti[0]?.tableNumber ??
      (vecchioCapo !== undefined && tavoli.includes(vecchioCapo)
        ? vecchioCapo
        : tavoli[0]);

    const altri = tavoli.filter((n) => n !== capo);

    // Un tavolo dove qualcuno ha gia' pagato non si porta su un altro conto:
    // la sua quota era stata calcolata su quel tavolo, e spostare il resto
    // cambierebbe il conto a chi se n'e' gia' andato.
    if (altri.length) {
      const idsAltri = ordiniAperti
        .filter((o) => o.tableNumber !== null && altri.includes(o.tableNumber))
        .map((o) => o.id);

      const pagate = idsAltri.length
        ? await tx
            .select({ id: orderItems.id })
            .from(orderItems)
            .where(
              and(
                inArray(orderItems.orderId, idsAltri),
                eq(orderItems.paid, true)
              )
            )
            .limit(1)
        : [];

      const saldi = await tx
        .select({ tableNumber: billSettlements.tableNumber })
        .from(billSettlements)
        .where(
          and(
            eq(billSettlements.tenantId, tenantId),
            inArray(billSettlements.tableNumber, altri)
          )
        )
        .limit(1);

      if (pagate.length || saldi.length) {
        return {
          ok: false as const,
          errore:
            "Su uno dei tavoli qualcuno ha gia' pagato: chiudi quel conto prima di unirlo.",
        };
      }

      if (idsAltri.length) {
        await tx
          .update(orders)
          .set({ tableNumber: capo })
          .where(inArray(orders.id, idsAltri));
      }
    }

    // Il gruppo piu' vecchio sopravvive e si allarga: cosi' «da quanto sono
    // seduti» resta il tempo vero e non riparte da adesso ogni volta che si
    // accosta una sedia.
    const [sopravvive, ...assorbite] = coinvolte;

    if (assorbite.length) {
      await tx
        .update(tableSittings)
        .set({ closedAt: new Date() })
        .where(
          inArray(
            tableSittings.id,
            assorbite.map((s) => s.id)
          )
        );
    }

    if (sopravvive) {
      await tx
        .update(tableSittings)
        .set({
          tableNumbers: tavoli,
          mainTable: capo,
          // Le persone si aggiornano solo se qualcuno le ha dette adesso: un
          // campo lasciato vuoto non cancella quello che si sapeva prima.
          ...(persone ? { partySize: persone } : {}),
          ...(reservationId ? { reservationId } : {}),
        })
        .where(eq(tableSittings.id, sopravvive.id));
    } else {
      await tx.insert(tableSittings).values({
        tenantId,
        tableNumbers: tavoli,
        mainTable: capo,
        partySize: persone ?? null,
        reservationId: reservationId ?? null,
      });
    }

    return { ok: true as const, capofila: capo, tavoli };
  });
}

// Quali di questi tavoli sono impegnati adesso, e da quando.
//
// Un tavolo e' impegnato se ci sta seduto un gruppo o se ci sta sopra un conto
// aperto. Serve prima di mandarci qualcuno: la prenotazione dice che il tavolo
// 1 e' suo alle 20:30, ma se alle 20:30 al tavolo 1 c'e' ancora gente, farli
// accomodare vuol dire mescolare due conti e due tavolate.
export type TavoloImpegnato = {
  tavolo: number;
  // Da quando c'e' qualcuno, quando si sa.
  da: Date | null;
};

export async function tavoliImpegnati(
  tenantId: string,
  numeri: number[],
  // La prenotazione che sta arrivando: la sua seduta non e' un impedimento,
  // sono loro.
  { ignoraPrenotazione }: { ignoraPrenotazione?: string } = {}
): Promise<TavoloImpegnato[]> {
  if (!numeri.length) return [];

  const aperte = (await seduteAperte(tenantId)).filter(
    (s) => !ignoraPrenotazione || s.reservationId !== ignoraPrenotazione
  );

  const ordini = await db
    .select({ tableNumber: orders.tableNumber, createdAt: orders.createdAt })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.channel, "tavolo"),
        isNull(orders.closedAt),
        inArray(orders.tableNumber, numeri)
      )
    )
    .orderBy(asc(orders.createdAt));

  const out: TavoloImpegnato[] = [];
  for (const n of [...new Set(numeri)].sort((a, b) => a - b)) {
    const seduta = sedutaDi(aperte, n);
    const primo = ordini.find((o) => o.tableNumber === n)?.createdAt ?? null;
    if (!seduta && !primo) continue;
    const momenti = [seduta?.apertaAlle, primo].filter((d): d is Date => !!d);
    out.push({
      tavolo: n,
      da: momenti.length
        ? momenti.reduce((x, y) => (x <= y ? x : y))
        : null,
    });
  }
  return out;
}

// Sposta un gruppo, con tutto quello che si porta dietro, su un altro tavolo.
//
// Nasce per la correzione piu' comune che non si poteva fare: il conto aperto
// sul tavolo sbagliato — il cameriere ha battuto sul 5 invece che sul 6, o il
// cliente ha inquadrato il QR di fianco. Fino a ieri l'unica uscita era
// annullare le righe e ribatterle, lasciando barrature su un tavolo dove non
// si e' mai seduto nessuno. Serve anche quando il gruppo si sposta davvero:
// il dehors che rientra perche' ha cominciato a piovere.
//
// I tavoli di arrivo devono essere liberi. Se uno e' occupato non e' uno
// spostamento ma una fusione di due conti, e quella si chiama «unisci»: farla
// passare di qui vorrebbe dire mescolare due tavolate per un tocco sbagliato.
//
// L'arrivo puo' essere piu' d'un tavolo: la tavolata da dodici che rientra dal
// dehors non entra in un tavolo solo, e spostarla in due mosse vorrebbe dire
// lasciarla mezza dentro e mezza fuori nel frattempo.
export async function spostaTavolo(
  tenantId: string,
  da: number,
  arrivo: number[]
): Promise<EsitoSeduta> {
  const a = [
    ...new Set(
      (Array.isArray(arrivo) ? arrivo : [arrivo]).filter(
        (n) => Number.isInteger(n) && n > 0
      )
    ),
  ].sort((x, y) => x - y);

  if (!Number.isInteger(da) || !a.length) {
    return {
      ok: false,
      errore: "Scegli il tavolo da spostare e dove mandarlo.",
    };
  }
  if (a.length > MAX_TAVOLI) {
    return {
      ok: false,
      errore: `Piu' di ${MAX_TAVOLI} tavoli accostati non e' piu' un tavolo: quello si concorda a voce.`,
    };
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`
    );

    const esistenti = (
      await tx
        .select({ number: restaurantTables.number })
        .from(restaurantTables)
        .where(eq(restaurantTables.tenantId, tenantId))
    ).map((t) => t.number);
    const mancante = [da, ...a].find((n) => !esistenti.includes(n));
    if (mancante !== undefined) {
      return {
        ok: false as const,
        errore: `Il tavolo ${mancante} non esiste in questa sala.`,
      };
    }

    const aperte = await seduteAperte(tenantId, tx);
    const seduta = sedutaDi(aperte, da);
    const partenza = seduta?.tavoli ?? [da];
    // Un tavolo dove il gruppo sta gia' non e' un arrivo occupato: e' se
    // stesso. Spostare 3+4 su 4+5 vuol dire lasciare il 4 e prendersi il 5.
    const occupato = a.find(
      (n) => !partenza.includes(n) && sedutaDi(aperte, n)
    );
    if (occupato !== undefined) {
      return {
        ok: false as const,
        errore: `Al tavolo ${occupato} c'e' gia' un gruppo. Se sono gli stessi, uniscili invece di spostarli.`,
      };
    }

    const capo = seduta?.capofila ?? da;
    const capoNuovo = a[0];

    const ordini = await tx
      .select({ id: orders.id, tableNumber: orders.tableNumber })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.channel, "tavolo"),
          isNull(orders.closedAt),
          inArray(orders.tableNumber, [...new Set([...partenza, ...a])])
        )
      );

    const conConto = a.find(
      (n) => !partenza.includes(n) && ordini.some((o) => o.tableNumber === n)
    );
    if (conConto !== undefined) {
      return {
        ok: false as const,
        errore: `Il tavolo ${conConto} ha gia' un conto aperto: chiudilo, oppure unisci i tavoli.`,
      };
    }

    const daSpostare = ordini
      .filter((o) => o.tableNumber !== capoNuovo)
      .map((o) => o.id);
    if (!seduta && !ordini.length) {
      return {
        ok: false as const,
        errore: `Il tavolo ${da} e' libero: non c'e' niente da spostare.`,
      };
    }

    if (daSpostare.length) {
      await tx
        .update(orders)
        .set({ tableNumber: capoNuovo })
        .where(inArray(orders.id, daSpostare));
    }

    // Gli incassi parziali stanno sul capofila e solo li': e' quello il numero
    // con cui la cassa li registra. Vanno spostati o chi ha gia' pagato
    // risulterebbe di nuovo da incassare.
    if (capo !== capoNuovo) {
      await tx
        .update(billSettlements)
        .set({ tableNumber: capoNuovo })
        .where(
          and(
            eq(billSettlements.tenantId, tenantId),
            eq(billSettlements.tableNumber, capo)
          )
        );
    }

    // Una chiamata in attesa segue la gente: chi risponde deve trovarla dove
    // adesso sono seduti, non dove erano.
    await tx
      .update(waiterCalls)
      .set({ tableNumber: capoNuovo })
      .where(
        and(
          eq(waiterCalls.tenantId, tenantId),
          inArray(waiterCalls.tableNumber, partenza),
          isNull(waiterCalls.resolvedAt)
        )
      );

    // La seduta si aggiorna invece di rifarla: cosi' l'ora in cui si sono
    // seduti resta quella vera, e in sala non risultano arrivati adesso.
    if (seduta) {
      await tx
        .update(tableSittings)
        .set({ tableNumbers: a, mainTable: capoNuovo })
        .where(eq(tableSittings.id, seduta.id));
    } else if (a.length > 1) {
      // Non c'era nessuna seduta — solo un conto su un tavolo — ma adesso i
      // tavoli sono due: senza scriverlo, il secondo risulterebbe libero.
      await tx.insert(tableSittings).values({
        tenantId,
        tableNumbers: a,
        mainTable: capoNuovo,
      });
    }

    return { ok: true as const, capofila: capoNuovo, tavoli: a };
  });
}

// Chiude la seduta che tiene questo tavolo, qualunque sia il capofila.
//
// Quello che era gia' stato ordinato resta dov'e': le comande sono partite, le
// consumazioni sono sul conto del capofila, e ridistribuirle sui tavoli di
// partenza vorrebbe dire indovinare chi ha mangiato cosa.
export async function chiudiSeduta(
  tenantId: string,
  tavolo: number
): Promise<Seduta | null> {
  const seduta = sedutaDi(await seduteAperte(tenantId), tavolo);
  if (!seduta) return null;

  await db
    .update(tableSittings)
    .set({ closedAt: new Date() })
    .where(eq(tableSittings.id, seduta.id));

  return seduta;
}

// Quante persone si sono sedute, corretto a mano dalla sala.
export async function aggiornaPersone(
  tenantId: string,
  tavolo: number,
  persone: number | null
): Promise<void> {
  const seduta = sedutaDi(await seduteAperte(tenantId), tavolo);
  if (!seduta) return;

  await db
    .update(tableSittings)
    .set({ partySize: persone })
    .where(eq(tableSittings.id, seduta.id));
}
