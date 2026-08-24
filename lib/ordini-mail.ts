import { inviaMailLocale } from "@/lib/mail";
import {
  linkDelLocale,
  mailHtml,
  mailTesto,
  type CorpoMail,
  type MittenteLocale,
} from "@/lib/mittente";
import { formatPrice } from "@/lib/format";
import type { Channel } from "@/lib/channels";
import type { OrdineWeb } from "@/lib/ordini-web";

// Le mail che il locale manda a chi ha ordinato dal sito.
//
// Servono alla stessa cosa delle conferme di prenotazione: mettere in mano al
// cliente la sua roba. Con una differenza che conta — qui il locale accetta a
// mano, e fra l'invio e l'accettazione passa del tempo in cui il cliente non sa
// niente. La prima mail dice "l'abbiamo ricevuto", la seconda "e' confermato
// per le 20:30": senza, quel tempo lo si passa a guardare il telefono.

export type AvvisoOrdine =
  | "ricevuto"
  | "confermato"
  | "spostato"
  | "rifiutato";

export type OrdineAvviso = {
  nome: string;
  email: string | null;
  canale: Channel;
  quando: Date | null;
  // L'orario che il cliente aveva chiesto, quando il locale l'ha spostato.
  precedente?: Date | null;
  token: string;
  voci: { nome: string; quantita: number }[];
  totaleCents: number;
  consegnaCents: number;
  indirizzo?: string | null;
};

export function linkOrdine(slug: string, token: string): string {
  return linkDelLocale(slug, `/ordina/${token}`);
}

function quando(d: Date): string {
  return d.toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function elenco(o: OrdineAvviso): string {
  return o.voci.map((v) => `${v.quantita}× ${v.nome}`).join(" · ");
}

// Come si paga, detto una volta sola: e' la domanda che chiunque si fa dopo
// aver ordinato senza tirare fuori la carta.
function pagamento(o: OrdineAvviso): string {
  return o.canale === "domicilio"
    ? "Si paga alla consegna, a chi te lo porta."
    : "Si paga al ritiro, in cassa.";
}

type Testo = {
  oggetto: string;
  titolo: string;
  apertura: string;
  azione: string;
  chiusura: string;
};

function contenuto(
  tipo: AvvisoOrdine,
  o: OrdineAvviso,
  m: MittenteLocale
): Testo {
  const q = o.quando ? quando(o.quando) : "l'orario che ci siamo detti";
  const ritiro = o.canale !== "domicilio";

  switch (tipo) {
    case "ricevuto":
      return {
        oggetto: `Ordine ricevuto — ${q}`,
        titolo: "Ordine ricevuto",
        apertura: `Abbiamo ricevuto il tuo ordine per ${q}. Lo confermiamo noi a breve: fino ad allora in cucina non parte niente, e se qualcosa non torna ti chiamiamo.`,
        azione: "Vedi l'ordine",
        chiusura: pagamento(o),
      };
    case "confermato":
      return {
        oggetto: `Ordine confermato — ${q}`,
        titolo: "Ordine confermato",
        apertura: ritiro
          ? `È tutto a posto: lo prepariamo per ${q}, passa a ritirarlo.`
          : `È tutto a posto: te lo portiamo ${q}.`,
        azione: "Vedi l'ordine",
        chiusura: pagamento(o),
      };
    case "spostato":
      return {
        oggetto: `Ordine spostato — ${q}`,
        titolo: "Ordine spostato",
        apertura: [
          o.precedente
            ? `Per ${quando(o.precedente)} non ce la facevamo.`
            : "Abbiamo dovuto spostare il tuo ordine.",
          ritiro
            ? `Te lo prepariamo per ${q}.`
            : `Te lo portiamo ${q}.`,
        ].join(" "),
        azione: "Vedi l'ordine",
        chiusura: m.telefono
          ? `Se quell'ora non ti va, chiamaci allo ${m.telefono}.`
          : "Se quell'ora non ti va, rispondi a questa mail.",
      };
    case "rifiutato":
      return {
        oggetto: "Ordine non accettato",
        titolo: "Ordine non accettato",
        apertura: `Non siamo riusciti a prendere il tuo ordine per ${q}. Non è stato preparato niente e non devi niente.`,
        azione: "Vedi l'ordine",
        chiusura: m.telefono
          ? `Se vuoi riprovare con un altro orario, chiamaci allo ${m.telefono}.`
          : "Se vuoi riprovare con un altro orario, rispondi a questa mail.",
      };
  }
}

function corpo(
  t: Testo,
  o: OrdineAvviso,
  m: MittenteLocale,
  link: string
): CorpoMail {
  const righe: [string, string][] = [];
  if (o.quando) {
    righe.push([o.canale === "domicilio" ? "Consegna" : "Ritiro", quando(o.quando)]);
  }
  righe.push(["Cosa", elenco(o)]);
  if (o.indirizzo) righe.push(["Dove", o.indirizzo]);
  if (o.consegnaCents > 0) {
    righe.push(["Consegna", formatPrice(o.consegnaCents)]);
  }
  righe.push(["Totale", formatPrice(o.totaleCents)]);
  righe.push(["A nome di", o.nome]);

  return {
    occhiello: m.nome,
    titolo: t.titolo,
    saluto: `Ciao ${o.nome},`,
    apertura: t.apertura,
    righe,
    azione: t.azione,
    link,
    chiusura: t.chiusura,
    nota: m.nota,
    firma: [m.nome, m.indirizzo, m.telefono].filter(Boolean).join(" · "),
    piede: `Ricevi questa mail perché hai ordinato da ${m.nome}.`,
  };
}

// Il riassunto per il locale, in una riga: e' quello che legge sul telefono
// quando la coda e' su un altro schermo.
export function riepilogoOrdine(o: OrdineAvviso): string {
  const pezzi = o.voci.reduce((s, v) => s + v.quantita, 0);
  return [
    o.canale === "domicilio" ? "Domicilio" : "Asporto",
    o.quando ? quando(o.quando) : null,
    `${pezzi} ${pezzi === 1 ? "pezzo" : "pezzi"}`,
    formatPrice(o.totaleCents),
    o.nome,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Manda l'avviso. Torna `false` senza rumore quando non c'e' niente da mandare
// — locale senza posta configurata, o cliente che non ha lasciato un indirizzo
// — perche' quello non e' un errore: l'ordine vale lo stesso.
export async function avvisaClienteOrdine(
  tipo: AvvisoOrdine,
  o: OrdineAvviso,
  m: MittenteLocale | null
): Promise<boolean> {
  if (!m?.smtp || !o.email) return false;

  const link = linkOrdine(m.slug, o.token);
  const t = contenuto(tipo, o, m);

  try {
    await inviaMailLocale(m.smtp, {
      a: o.email,
      oggetto: `${t.oggetto} — ${m.nome}`,
      testo: mailTesto(corpo(t, o, m, link)),
      html: mailHtml(corpo(t, o, m, link)),
    });
    return true;
  } catch (e) {
    // Una mail che non parte non deve far fallire l'ordine: la roba si prepara
    // comunque, e chi l'ha accettato se lo vede scritto in coda.
    console.error("[ordini] mail non inviata", e);
    return false;
  }
}

// L'ordine riletto da database, ridotto a quello che serve per la mail. Sta
// qui e non nei chiamanti perche' lo fanno in tre — l'invio, l'accettazione e
// il rifiuto — e sarebbe la stessa conversione scritta tre volte.
export function avvisoDa(
  o: OrdineWeb,
  precedente?: Date | null
): OrdineAvviso | null {
  if (!o.token) return null;
  return {
    nome: o.nome ?? "",
    email: o.email,
    canale: o.canale,
    quando: o.quando,
    precedente: precedente ?? null,
    token: o.token,
    voci: o.voci
      .filter((v) => !v.annullata)
      .map((v) => ({ nome: v.nome, quantita: v.quantita })),
    totaleCents: o.totaleCents,
    consegnaCents: o.consegnaCents,
    indirizzo: o.indirizzo,
  };
}
