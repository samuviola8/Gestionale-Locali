"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  contestoOrdineWeb,
  dentroOrizzonte,
  fasceLibere,
  canaleDi,
  fasceOrdinabili,
  istante,
  pezziImpegnati,
  ordinePerToken,
  salvaOrdineWeb,
  valutaCarrello,
  type MotivoVuoto,
} from "@/lib/ordini-web";
import { costoConsegna, distanzaDaLocale } from "@/lib/consegna";
import {
  avvisaClienteOrdine,
  avvisoDa,
  riepilogoOrdine,
} from "@/lib/ordini-mail";
import { avvisaLocale, mittenteLocale } from "@/lib/mittente";
import { isChannel, type Channel } from "@/lib/channels";
import type { IncomingItem } from "@/lib/order-create";
import { formatKm, formatPrice } from "@/lib/format";
import { troppeRichieste } from "@/lib/limite";
import { NOME_COOKIE, localeDalSito } from "@/lib/ordini-web";
import { salvaRecensione, salvaTestimonianza } from "@/lib/recensioni";

// Le azioni della pagina pubblica d'ordinazione. Sono aperte a chiunque
// conosca l'indirizzo del locale: qui dentro non ci si fida di niente di
// quello che arriva dal browser — non dei prezzi, non della distanza, non
// della fascia che un attimo prima risultava libera.

const FINESTRA_MS = 30 * 60 * 1000;
// Un ordine si invia una volta, e chi ne manda cinque in mezz'ora o ha un
// problema o non e' una persona. Le stime invece si chiedono a ogni riga
// aggiunta al carrello: la mano piu' larga e' li' perche' e' li' che si usa.
const LIMITE_INVII = 5;
const LIMITE_STIME = 40;
// Le recensioni: una per ordine la tiene il database, ma un indirizzo che ne
// prova venti in un'ora sta tentando qualcos'altro.
const LIMITE_RECENSIONI = 10;

async function chiChiama(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "sconosciuto";
}

function pulisci(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

const TELEFONO_VALIDO = /^[0-9+().\s-]{6,32}$/;
const EMAIL_VALIDA = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Le righe che arrivano dal browser, ridotte a quello che ci si puo' fidare di
// leggere: identificativi, quantita' e testo. I prezzi non passano di qui.
function righeInArrivo(v: unknown): IncomingItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, 60)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const quantity = Math.trunc(Number(o.quantity));
      return {
        productId: pulisci(o.productId, 40),
        variantId: pulisci(o.variantId, 40) || null,
        // Fuori dalla sala non si divide niente: il conto e' l'ordine.
        alias: "Tavolo",
        quantity: Number.isInteger(quantity) ? Math.min(Math.max(quantity, 0), 99) : 0,
        note: pulisci(o.note, 200),
      };
    })
    .filter((i) => i.productId && i.quantity > 0);
}

function canaleValido(v: string, attivi: Channel[]): Channel | null {
  return isChannel(v) && attivi.includes(v) ? v : null;
}

function giornoValido(giorno: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return null;
  const d = new Date(`${giorno}T12:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// --- Le fasce libere --------------------------------------------------------

export type EsitoFasce =
  | { ok: true; fasce: string[]; motivo?: MotivoVuoto }
  | { ok: false; errore: string };

// Gli orari ancora liberi per un giorno e per **questo** carrello. Si
// ricalcolano a ogni richiesta invece di mandarli tutti in pagina: fra il
// caricamento e la scelta possono passare dieci minuti, e in dieci minuti una
// fascia si riempie.
export async function cercaFasce(
  canale: string,
  giorno: string,
  pezzi: number
): Promise<EsitoFasce> {
  const ctx = await contestoOrdineWeb();
  if (!ctx) return { ok: false, errore: "Gli ordini online non sono attivi." };

  const c = canaleValido(canale, ctx.canali);
  if (!c) return { ok: false, errore: "Canale non disponibile." };

  const quando = giornoValido(giorno);
  if (!quando) return { ok: false, errore: "Data non valida." };

  const quanti = Math.trunc(Number(pezzi));
  if (!Number.isInteger(quanti) || quanti < 1) {
    return { ok: false, errore: "Aggiungi qualcosa al carrello." };
  }

  const adesso = new Date();
  if (!dentroOrizzonte(quando, adesso, ctx.cfg, c)) {
    return { ok: true, fasce: [], motivo: "oltre" };
  }

  const tutte = fasceOrdinabili(ctx.orari, quando, adesso, ctx.cfg, c);
  if (!tutte.length) return { ok: true, fasce: [], motivo: "chiuso" };

  // Un carrello piu' grande di quanto la cucina prepara in una fascia non
  // trovera' mai posto, per quanto il locale sia vuoto: e' un caso da dire, non
  // da far scoprire provando tutti i giorni della settimana.
  if (ctx.cfg.pezziPerFascia > 0 && quanti > ctx.cfg.pezziPerFascia) {
    return { ok: true, fasce: [], motivo: "troppo-grande" };
  }

  const libere = fasceLibere({
    fasce: tutte,
    impegnati: await pezziImpegnati(ctx.tenantId, quando),
    giorno: quando,
    pezzi: quanti,
    tetto: ctx.cfg.pezziPerFascia,
  });

  return {
    ok: true,
    fasce: libere,
    motivo: libere.length ? undefined : "pieno",
  };
}

// --- Il costo della consegna ------------------------------------------------

export type EsitoStima =
  | { ok: true; km: number; costoCents: number; messaggio: string }
  // Si puo' ordinare lo stesso, ma il costo lo dira' il locale.
  | { ok: true; km: null; costoCents: 0; messaggio: string; daConfermare: true }
  | { ok: false; messaggio: string };

// Quanto costa portargliela a casa. La distanza la misura il server
// dall'indirizzo: quello che arriva dal browser e' solo il testo scritto dal
// cliente, mai un numero di chilometri e mai un costo.
export async function stimaConsegna(
  indirizzo: string,
  imponibileCents: number
): Promise<EsitoStima> {
  const ctx = await contestoOrdineWeb();
  if (!ctx || !ctx.canali.includes("domicilio")) {
    return { ok: false, messaggio: "Le consegne non sono attive." };
  }

  const dove = pulisci(indirizzo, 200);
  if (dove.length < 6) {
    return { ok: false, messaggio: "Scrivi via, numero civico e comune." };
  }

  const imponibile = Math.trunc(Number(imponibileCents));
  if (!Number.isInteger(imponibile) || imponibile < 0) {
    return { ok: false, messaggio: "Carrello non valido." };
  }

  if (troppeRichieste(`stima:${await chiChiama()}`, LIMITE_STIME, FINESTRA_MS)) {
    return {
      ok: false,
      messaggio: "Troppe verifiche di fila. Aspetta un attimo e riprova.",
    };
  }

  const km = await distanzaDaLocale(ctx.tenantId, dove);
  const esito = costoConsegna({
    fasce: ctx.fasce,
    km,
    imponibileCents: imponibile,
    gratisSopraCents: ctx.gratisSopraCents,
    minimoCanaleCents: ctx.cfg.domicilio.minimoCents,
  });

  if (esito.ok) {
    return {
      ok: true,
      km: esito.km,
      costoCents: esito.costoCents,
      messaggio:
        esito.costoCents === 0
          ? `Consegna offerta · ${formatKm(esito.km)}`
          : `Consegna ${formatPrice(esito.costoCents)} · ${formatKm(esito.km)}`,
    };
  }

  if (esito.motivo === "distanza-sconosciuta") {
    return {
      ok: true,
      km: null,
      costoCents: 0,
      daConfermare: true,
      messaggio:
        "Non siamo riusciti a trovare l'indirizzo sulla mappa: l'ordine si può fare lo stesso, e il costo della consegna te lo conferma il locale.",
    };
  }

  return { ok: false, messaggio: perche(esito, ctx.fasce.length) };
}

function perche(
  esito: Exclude<ReturnType<typeof costoConsegna>, { ok: true }>,
  quanteFasce: number
): string {
  switch (esito.motivo) {
    case "nessuna-zona":
      return "Le consegne non sono ancora attive: puoi ordinare per il ritiro.";
    case "fuori-zona":
      return `Siamo fuori zona: da qui si consegna fino a ${formatKm(esito.kmMassimi)}, e tu sei a ${formatKm(esito.km)}. Puoi ordinare per il ritiro.`;
    case "sotto-minimo":
      return `Per consegnare in questa zona serve un ordine da ${formatPrice(
        esito.minimoCents
      )}: ti mancano ${formatPrice(esito.mancanoCents)}.`;
    default:
      return quanteFasce
        ? "Non riusciamo a calcolare la consegna."
        : "Le consegne non sono ancora attive.";
  }
}

// --- L'ordine ---------------------------------------------------------------

export type DatiOrdine = {
  canale: string;
  righe: unknown;
  giorno: string;
  ora: string;
  nome: string;
  telefono: string;
  email?: string;
  indirizzo?: string;
  /** Campo esca: un umano non lo vede e non lo compila. */
  sito?: string;
};

export type EsitoInvio =
  | { ok: true; token: string }
  | { ok: false; errore: string };

export async function inviaOrdine(dati: DatiOrdine): Promise<EsitoInvio> {
  const ctx = await contestoOrdineWeb();
  if (!ctx) return { ok: false, errore: "Gli ordini online non sono attivi." };

  // Ai robot si risponde di si' senza scrivere niente: dire loro dov'e' il
  // controllo servirebbe solo a farglielo aggirare al tentativo dopo.
  if (pulisci(dati.sito, 40)) return { ok: true, token: "" };

  // Il rubinetto chiuso durante il servizio: la pagina lo dice gia', ma chi
  // l'aveva aperta prima ha ancora il modulo compilato sotto le dita.
  if (ctx.sospesoFino) {
    return {
      ok: false,
      errore:
        "Il locale ha appena sospeso gli ordini dal sito per stasera. Se ti serve, prova a chiamarlo.",
    };
  }

  const canale = canaleValido(dati.canale, ctx.canali);
  if (!canale) return { ok: false, errore: "Canale non disponibile." };

  // Le regole di questo canale: preavviso, orizzonte, minimo, accettazione.
  // L'asporto e il domicilio ne hanno di proprie, e mescolarle vorrebbe dire
  // accettare un ordine con le regole dell'altro.
  const regole = canaleDi(ctx.cfg, canale);

  const nome = pulisci(dati.nome, 80);
  const telefono = pulisci(dati.telefono, 32);
  const email = pulisci(dati.email, 160);
  const indirizzo = pulisci(dati.indirizzo, 200);

  if (nome.length < 2) {
    return { ok: false, errore: "Scrivi il nome di chi passa a ritirare." };
  }
  if (!TELEFONO_VALIDO.test(telefono)) {
    return {
      ok: false,
      errore: "Serve un telefono valido: è l'unico modo per avvisarti.",
    };
  }
  if (canale === "domicilio" && indirizzo.length < 6) {
    return { ok: false, errore: "Serve l'indirizzo: via, civico e comune." };
  }
  // Dove il locale ha la posta, la mail è il modo in cui il cliente viene a
  // sapere che l'ordine è stato accettato: chiederla «se vuoi» vorrebbe dire
  // prometterla a metà dei clienti e non mandarla.
  if (ctx.mailAttiva && !email) {
    return {
      ok: false,
      errore: "Serve l'email: è lì che ti arriva la conferma dell'ordine.",
    };
  }
  if (email && !EMAIL_VALIDA.test(email)) {
    return { ok: false, errore: "Controlla l'indirizzo email." };
  }

  const righe = righeInArrivo(dati.righe);
  if (!righe.length) return { ok: false, errore: "Il carrello è vuoto." };

  // Prezzi e disponibilita' si rileggono dal database: il carrello che arriva
  // dice cosa, non quanto costa ne' se si puo' portare via.
  const valutato = await valutaCarrello(ctx.tenantId, canale, righe);
  if (!valutato.ok) return { ok: false, errore: valutato.errore };
  const { imponibileCents, pezzi } = valutato.carrello;

  // Il minimo del canale. A domicilio lo guarda `costoConsegna` insieme a
  // quello della zona — li' comanda il piu' alto — quindi qui resta il solo
  // ritiro, che di zone non ne ha.
  const minimo = regole.minimoCents;
  if (canale !== "domicilio" && minimo > 0 && imponibileCents < minimo) {
    return {
      ok: false,
      errore: `Per il ritiro serve un ordine da ${formatPrice(
        minimo
      )}: ti mancano ${formatPrice(minimo - imponibileCents)}.`,
    };
  }

  // Il costo della consegna si ricalcola adesso, e non si prende quello che il
  // browser aveva visto: fra la stima e l'invio il carrello puo' essere
  // cambiato, e con lui il minimo d'ordine e la consegna offerta.
  let consegnaCents = 0;
  let km: number | null = null;
  let distanzaIgnota = false;

  if (canale === "domicilio") {
    km = await distanzaDaLocale(ctx.tenantId, indirizzo);
    const esito = costoConsegna({
      fasce: ctx.fasce,
      km,
      imponibileCents,
      gratisSopraCents: ctx.gratisSopraCents,
      minimoCanaleCents: ctx.cfg.domicilio.minimoCents,
    });
    if (esito.ok) {
      consegnaCents = esito.costoCents;
    } else if (esito.motivo === "distanza-sconosciuta") {
      // L'indirizzo non si e' trovato: l'ordine entra lo stesso, ma il costo lo
      // scrive il locale — e allora lo deve guardare una persona, anche dove
      // l'accettazione e' automatica.
      distanzaIgnota = true;
    } else {
      return { ok: false, errore: perche(esito, ctx.fasce.length) };
    }
  }

  const giorno = giornoValido(dati.giorno);
  if (!giorno || !/^\d{1,2}:\d{2}$/.test(dati.ora)) {
    return { ok: false, errore: "Data e ora non valide." };
  }
  const quando = istante(giorno, dati.ora);

  const adesso = new Date();
  if (!dentroOrizzonte(quando, adesso, ctx.cfg, canale)) {
    return {
      ok: false,
      errore: `Online si ordina fino a ${regole.giorniAvanti} giorni in anticipo.`,
    };
  }
  if (!fasceOrdinabili(ctx.orari, giorno, adesso, ctx.cfg, canale).includes(dati.ora)) {
    return {
      ok: false,
      errore: "Quell'orario non è più proponibile. Scegline un altro qui sopra.",
    };
  }

  if (troppeRichieste(`invio:${await chiChiama()}`, LIMITE_INVII, FINESTRA_MS)) {
    return {
      ok: false,
      errore:
        "Hai già inviato diversi ordini. Se serve cambiarne uno, chiama il locale.",
    };
  }

  const esito = await salvaOrdineWeb({
    tenantId: ctx.tenantId,
    canale,
    items: righe,
    modules: ctx.modules,
    cfg: ctx.cfg,
    quando,
    pezzi,
    nome,
    telefono,
    email: email || null,
    indirizzo: canale === "domicilio" ? indirizzo : null,
    consegnaCents,
    km,
    automatica: regole.accettazioneAutomatica && !distanzaIgnota,
  });

  if (!esito.ok) return { ok: false, errore: esito.errore };

  // Le mail partono adesso, e sono due, con due interruttori distinti: quella
  // al cliente — «l'abbiamo ricevuto» dove risponde una persona, «è
  // confermato» dove entra in cucina da solo, col link per seguirlo — e la
  // riga al locale sulla propria casella. Sono due destinatari diversi e due
  // decisioni diverse: c'è chi avvisa il cliente e tiene la coda a schermo, e
  // chi non manda niente a nessuno ma vuole sapere che è arrivato un ordine.
  const salvato = await ordinePerToken(ctx.tenantId, esito.token);
  const avviso = salvato ? avvisoDa(salvato) : null;
  if (avviso) {
    const mittente = await mittenteLocale(
      ctx.tenantId,
      canale === "domicilio" ? "domicilio" : "asporto"
    );

    if (regole.mailConferme) {
      await avvisaClienteOrdine(
        esito.stato === "pending" ? "ricevuto" : "confermato",
        avviso,
        mittente
      );
    }

    // La coda sta su un altro schermo, e un ordine arrivato mentre nessuno
    // guarda è un ordine che scade.
    if (regole.mailLocale) {
      await avvisaLocale(
        mittente,
        "Nuovo ordine dal sito — " + riepilogoOrdine(avviso),
        [
          esito.stato === "pending"
            ? "È da accettare: aprilo dalla coda ordini."
            : "È già in coda: l'accettazione automatica è accesa.",
          riepilogoOrdine(avviso),
          telefono,
          indirizzo || null,
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  // Il sito si ricorda l'ultimo ordine di questo telefono, per una settimana:
  // chi chiude la pagina o ricarica non deve restare senza. Non e' un accesso —
  // e' solo il link che il cliente ha gia' — e serve a non dipendere dalla
  // mail, che puo' non essere stata lasciata o essere finita nello spam.
  (await cookies()).set(NOME_COOKIE, esito.token, {
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
    httpOnly: true,
    sameSite: "lax",
  });

  // La coda del locale mostra gli ordini da accettare: quello appena arrivato
  // deve esserci gia' al primo sguardo.
  revalidatePath("/dashboard/orders");
  return { ok: true, token: esito.token };
}

// --- Com'e' andata ----------------------------------------------------------
//
// La chiave e' il token dell'ordine: chi ce l'ha ha ordinato davvero, ed e'
// per questo che la recensione e' verificata. Non serve nessun accesso, e non
// si puo' recensire un ordine che non e' tuo.

export async function lasciaRecensione(
  token: string,
  voto: number,
  testo: string
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const locale = await localeDalSito();
  if (!locale) return { ok: false, errore: "Locale non trovato." };

  // Una raffica di voti da uno stesso indirizzo non e' un cliente contento.
  if (troppeRichieste(`rec:${await chiChiama()}`, LIMITE_RECENSIONI, 60 * 60 * 1000)) {
    return { ok: false, errore: "Hai gia' scritto. Riprova piu' tardi." };
  }

  const ordine = await ordinePerToken(locale.tenantId, token);
  if (!ordine) return { ok: false, errore: "Ordine non trovato." };

  return await salvaRecensione({
    tenantId: locale.tenantId,
    orderId: ordine.id,
    canale: ordine.canale,
    voto,
    testo,
  });
}

export async function lasciaTestimonianza(
  token: string,
  voto: number,
  testo: string,
  firma: string,
  pubblicabile: boolean
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const locale = await localeDalSito();
  if (!locale) return { ok: false, errore: "Locale non trovato." };

  if (troppeRichieste(`tes:${await chiChiama()}`, LIMITE_RECENSIONI, 60 * 60 * 1000)) {
    return { ok: false, errore: "Hai gia' scritto. Riprova piu' tardi." };
  }

  // Il token serve lo stesso: e' la prova che dietro c'e' un ordine vero, e
  // tiene fuori chi riempirebbe la vetrina di frasi scritte da nessuno.
  const ordine = await ordinePerToken(locale.tenantId, token);
  if (!ordine) return { ok: false, errore: "Ordine non trovato." };

  return await salvaTestimonianza({
    tenantId: locale.tenantId,
    nomeLocale: locale.nome,
    ruolo: "cliente",
    voto,
    testo,
    firma,
    pubblicabile,
  });
}
