"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems, tenants } from "@/lib/db/schema";
import { getSessionUser, repartoAttivo } from "@/lib/auth";
import { creaComande } from "@/lib/stampa";
import {
  canaleDi,
  fineGiornata,
  leggiImpostazioniWeb,
  ordinePerToken,
  oraSpostata,
  segnaPartitoOrdine,
  segnaProntoOrdine,
} from "@/lib/ordini-web";
import {
  avvisaClienteOrdine,
  avvisoDa,
  type AvvisoOrdine,
} from "@/lib/ordini-mail";
import { mittenteLocale } from "@/lib/mittente";

const VALID = ["new", "preparing", "served"];

// Avanza la parte di ordine che compete a chi sta guardando: il pizzaiolo
// segna pronte le sue pizze, non i cocktail del barman. Lo stato dell'ordine
// e' la somma dei suoi pezzi, e si ricalcola dopo.
export async function advanceOrderStatus(
  orderId: string,
  status: string
): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  if (!VALID.includes(status)) return;

  const suo = await db
    .select({
      id: orders.id,
      status: orders.status,
      webToken: orders.webToken,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)))
    .limit(1);
  if (!suo.length) return;
  // Un ordine dal web ancora da accettare non si fa avanzare di nascosto:
  // passa da `accettaOrdine`, che e' il posto dove parte anche la comanda.
  if (suo[0].status === "pending") return;

  // Chi non ha un reparto (titolare, cassa) muove tutto l'ordine.
  const mio = repartoAttivo(session);
  const mie = mio
    ? and(eq(orderItems.orderId, orderId), eq(orderItems.repartoId, mio))
    : eq(orderItems.orderId, orderId);

  await db.update(orderItems).set({ status }).where(mie);

  const righe = await db
    .select({ status: orderItems.status, voidedAt: orderItems.voidedAt })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  // Un ordine e' servito quando lo sono tutti i suoi pezzi vivi: finche' la
  // cucina non ha finito, non lo e' nemmeno se il bar ha gia' consegnato.
  const vive = righe.filter((r) => r.voidedAt === null);
  const complessivo = !vive.length
    ? "served"
    : vive.every((r) => r.status === "served")
      ? "served"
      : vive.some((r) => r.status !== "new")
        ? "preparing"
        : "new";

  await db
    .update(orders)
    .set({ status: complessivo })
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)));

  // Chi ha ordinato dal sito sta guardando la sua pagina: quando qualcuno si
  // mette sotto glielo si dice. Solo al passaggio vero — "preparing" che era
  // gia' "preparing" non e' una notizia — e solo se il locale ha acceso gli
  // aggiornamenti.
  if (complessivo === "preparing" && suo[0].status !== "preparing") {
    await avvisa(session.tenantId, suo[0].webToken, "in-preparazione");
  }
}

// Il prodotto e' finito, o l'ordine era sbagliato: la voce esce dal conto.
// Annullata, non cancellata — resta barrata in coda e sul conto, cosi' il
// cliente vede cosa gli e' stato tolto e la cassa sa perche' il totale e' quello.
export async function voidOrderItem(
  itemId: string,
  annulla: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };

  const miei = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.tenantId, session.tenantId));

  // Come per il prezzo: una riga gia' incassata non si tocca, o la cassa non
  // torna piu' con quello che il cliente ha pagato.
  const cambiate = miei.length
    ? await db
        .update(orderItems)
        .set({ voidedAt: annulla ? new Date() : null })
        .where(
          and(
            eq(orderItems.id, itemId),
            inArray(
              orderItems.orderId,
              miei.map((o) => o.id)
            ),
            eq(orderItems.paid, false)
          )
        )
        .returning({ id: orderItems.id })
    : [];

  if (!cambiate.length)
    return { ok: false, error: "Riga già pagata: non si annulla più." };
  return { ok: true };
}


// La nota di una riga, corretta dopo. «Senza cipolla» detto al telefono a
// ordine gia' partito, o scritto male da chi l'ha battuto.
//
// Non ristampa niente: la comanda con la nota vecchia e' gia' in cucina, e una
// seconda uguale farebbe rifare il piatto. La nota nuova si vede in coda —
// dove chi prepara guarda — e sul conto; se la carta e' gia' uscita, quella si
// dice a voce, come si e' sempre fatto.
export async function cambiaNotaVoce(
  itemId: string,
  nota: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };

  const miei = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.tenantId, session.tenantId));
  if (!miei.length) return { ok: false, error: "Riga non trovata." };

  const pulita = String(nota ?? "").trim().slice(0, 200) || null;

  // Una riga gia' incassata non si tocca, come per il prezzo: il cliente ha
  // pagato quello che c'era scritto.
  const cambiate = await db
    .update(orderItems)
    .set({ note: pulita })
    .where(
      and(
        eq(orderItems.id, itemId),
        inArray(
          orderItems.orderId,
          miei.map((o) => o.id)
        ),
        eq(orderItems.paid, false)
      )
    )
    .returning({ id: orderItems.id });

  if (!cambiate.length)
    return { ok: false, error: "Riga già pagata: la nota non si cambia più." };
  return { ok: true };
}
// Il barman corregge il prezzo di una richiesta fuori standard. Si tocca la
// singola riga, non il prodotto a listino: la prossima richiesta riparte dal
// prezzo di partenza.
// Risponde sempre com'e' andata: un prezzo che non passa in silenzio e' peggio
// di un errore, perche' il barman chiude l'editor convinto di averlo cambiato.
export async function setItemPrice(
  itemId: string,
  priceCents: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100000)
    return { ok: false, error: "Prezzo non valido." };

  // La riga dev'essere di un ordine di questo locale, e non ancora saldata:
  // cambiare il prezzo di qualcosa di gia' incassato falserebbe la cassa.
  const miei = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.tenantId, session.tenantId));

  const cambiate = miei.length
    ? await db
        .update(orderItems)
        .set({ priceCents, priceAdjusted: true })
        .where(
          and(
            eq(orderItems.id, itemId),
            inArray(
              orderItems.orderId,
              miei.map((o) => o.id)
            ),
            eq(orderItems.paid, false)
          )
        )
        .returning({ id: orderItems.id })
    : [];

  if (!cambiate.length)
    return { ok: false, error: "Riga già pagata: il prezzo non si tocca più." };
  return { ok: true };
}

// --- Gli ordini arrivati dal web --------------------------------------------
//
// Un ordine battuto in cassa e' gia' accettato da chi l'ha battuto. Quello che
// arriva dal sito no: arriva mentre la cucina e' in ginocchio, o con la
// mozzarella finita, o da un indirizzo che si e' rivelato dall'altra parte del
// fiume. Per questo nasce "pending" e per questo la comanda parte adesso, non
// quando il cliente ha premuto invia.

// Com'e' andata la mail al cliente. "non-richiesta" e' il caso normale di chi
// non ha la posta configurata o di chi ha ordinato senza lasciare un
// indirizzo: non e' un guasto, e non va detto. "fallita" invece si', perche'
// il cliente sta aspettando una conferma che non arrivera'.
export type EsitoMail = "inviata" | "non-richiesta" | "fallita";

// Le conferme dicono se l'ordine c'e' o non c'e'; gli aggiornamenti
// raccontano dove e' arrivato mentre il cliente aspetta. Sono due interruttori
// diversi in impostazioni perche' sono due decisioni diverse: c'e' chi la
// conferma la vuole e i tre passi dopo li considera spam.
const CONFERME = ["confermato", "spostato", "rifiutato"];

async function avvisa(
  tenantId: string,
  token: string | null,
  tipo: AvvisoOrdine,
  precedente?: Date | null
): Promise<EsitoMail> {
  if (!token) return "non-richiesta";

  const salvato = await ordinePerToken(tenantId, token);
  const avviso = salvato ? avvisoDa(salvato, precedente) : null;
  if (!avviso?.email) return "non-richiesta";

  const [riga] = await db
    .select({
      webOrderChannels: tenants.webOrderChannels,
      webOrderPiecesPerSlot: tenants.webOrderPiecesPerSlot,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!riga) return "non-richiesta";

  const regole = canaleDi(leggiImpostazioniWeb(riga), avviso.canale);
  const acceso = CONFERME.includes(tipo)
    ? regole.mailConferme
    : regole.mailAggiornamenti;
  if (!acceso) return "non-richiesta";

  // La riga in fondo alla mail e' quella del canale dell'ordine.
  const mittente = await mittenteLocale(
    tenantId,
    avviso.canale === "domicilio" ? "domicilio" : "asporto"
  );
  if (!mittente?.smtp) return "non-richiesta";

  return (await avvisaClienteOrdine(tipo, avviso, mittente))
    ? "inviata"
    : "fallita";
}

// I due momenti che il cliente aspetta di vedere: "e' pronto" e "e' uscito".
// Non sono stati della cucina — quelli contano le righe — ma eventi con un'ora,
// segnati da chi sta in cassa quando succedono davvero.
export async function segnaPronto(
  orderId: string,
  pronto: boolean
): Promise<{ ok: boolean; mail: EsitoMail }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, mail: "non-richiesta" };

  const esito = await segnaProntoOrdine(session.tenantId, orderId, pronto);
  if (!esito.ok) return { ok: false, mail: "non-richiesta" };

  // Tornando indietro non si manda niente: al cliente e' gia' arrivato "e'
  // pronto", e una smentita via mail lo farebbe solo preoccupare. Chi si e'
  // sbagliato lo chiama.
  const mail = pronto
    ? await avvisa(session.tenantId, esito.token, "pronto")
    : ("non-richiesta" as const);

  return { ok: true, mail };
}

export async function segnaPartito(
  orderId: string
): Promise<{ ok: boolean; mail: EsitoMail }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, mail: "non-richiesta" };

  const esito = await segnaPartitoOrdine(session.tenantId, orderId);
  if (!esito.ok) return { ok: false, mail: "non-richiesta" };

  return {
    ok: true,
    mail: await avvisa(session.tenantId, esito.token, "in-consegna"),
  };
}

export type EsitoAccettazione =
  | { ok: true; comande: number; mail: EsitoMail }
  | { ok: false; error: string };

export async function accettaOrdine(
  orderId: string,
  correzioni?: {
    // Il costo di consegna corretto a mano, dove la distanza in linea d'aria
    // ha mentito. In centesimi.
    consegnaCents?: number;
    // L'ora concordata, se e' cambiata: "per le 20:30 non ce la faccio, per le
    // 21 si'". Arriva come istante intero e non come minuti da sommare —
    // "+30" e un orario battuto a mano sono la stessa cosa, e a decidere
    // quando l'ordine e' pronto e' un orario, non uno scarto. Il cliente lo
    // vede sulla sua pagina, e se le mail sono accese gli arriva anche li'.
    quando?: string;
  }
): Promise<EsitoAccettazione> {
  const session = await getSessionUser();
  if (!session) return { ok: false, error: "Sessione scaduta. Rientra." };

  const [o] = await db
    .select({
      id: orders.id,
      status: orders.status,
      channel: orders.channel,
      dueAt: orders.dueAt,
      webToken: orders.webToken,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)))
    .limit(1);
  if (!o) return { ok: false, error: "Ordine non trovato." };
  if (o.status !== "pending") {
    return { ok: false, error: "Questo ordine è già stato accettato." };
  }

  const consegna = correzioni?.consegnaCents;

  // L'ora nuova, se ne e' arrivata una. Le regole stanno in `oraSpostata`, che
  // le dice una volta sola e si puo' provare senza una sessione addosso.
  let nuova: Date | null = null;
  if (correzioni?.quando) {
    const esito = oraSpostata(o.dueAt, correzioni.quando);
    if (!esito.ok) return { ok: false, error: esito.errore };
    nuova = esito.quando;
  }

  await db
    .update(orders)
    .set({
      status: "new",
      ...(o.channel === "domicilio" &&
      Number.isInteger(consegna) &&
      consegna! >= 0 &&
      consegna! <= 5000
        ? { deliveryFeeCents: consegna! }
        : {}),
      ...(nuova ? { dueAt: nuova } : {}),
    })
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, session.tenantId)));

  // Adesso la comanda: segue l'impostazione del canale, come ogni altro
  // ordine. Quante ne sono partite torna a chi ha accettato, perche' "non
  // stampa niente" e' l'unica cosa che non deve scoprire da solo.
  const comande = await creaComande(session.tenantId, orderId);

  // La conferma al cliente. Se l'ora e' stata spostata glielo si dice, invece
  // di mandargli una conferma con dentro un orario diverso da quello che
  // ricordava: quella e' la mail che fa arrivare la gente all'ora sbagliata.
  const mail = await avvisa(
    session.tenantId,
    o.webToken,
    nuova ? "spostato" : "confermato",
    nuova ? o.dueAt : null
  );

  revalidatePath("/dashboard/bill");
  return { ok: true, comande, mail };
}

// Il locale non ce la fa, o il cliente non e' raggiungibile: l'ordine si
// chiude senza preparare niente. Resta scritto — il cliente lo vede sulla sua
// pagina, e in coda non ci torna piu'.
export async function rifiutaOrdine(
  orderId: string
): Promise<{ ok: boolean; mail: EsitoMail }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, mail: "non-richiesta" };

  const cambiati = await db
    .update(orders)
    .set({ status: "rejected", closedAt: new Date() })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.tenantId, session.tenantId),
        eq(orders.status, "pending")
      )
    )
    .returning({ id: orders.id, webToken: orders.webToken });

  if (!cambiati.length) return { ok: false, mail: "non-richiesta" };

  // Il rifiuto e' la mail che conta piu' di tutte: chi non la riceve si
  // presenta lo stesso, all'ora che si era segnato.
  const mail = await avvisa(
    session.tenantId,
    cambiati[0].webToken,
    "rifiutato"
  );

  return { ok: true, mail };
}

// Il rubinetto: stasera non se ne prendono altri. Si riapre da solo a
// mezzanotte, perche' l'interruttore che resta giu' e' quello che tiene un
// locale chiuso al web per una settimana senza che nessuno se ne accorga.
export async function sospendiOrdiniWeb(
  sospendi: boolean
): Promise<{ fino: string | null }> {
  const session = await getSessionUser();
  if (!session) return { fino: null };

  const fino = sospendi ? fineGiornata() : null;
  await db
    .update(tenants)
    .set({ webOrdersPausedUntil: fino })
    .where(eq(tenants.id, session.tenantId));

  return { fino: fino?.toISOString() ?? null };
}
