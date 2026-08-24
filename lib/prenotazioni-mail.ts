import { inviaMailLocale } from "@/lib/mail";
import {
  linkDelLocale,
  mailHtml,
  mailTesto,
  type CorpoMail,
  type MittenteLocale,
} from "@/lib/mittente";
import { etichettaTavoli } from "@/lib/prenotazioni";

// Il mittente e l'avviso al locale valgono per qualsiasi mail: stanno in
// lib/mittente.ts, e da qui si ripassano perche' mezza dashboard li importa da
// questo file.
export { avvisaLocale, mittenteLocale } from "@/lib/mittente";
export type { MittenteLocale } from "@/lib/mittente";

// Le mail che il locale manda a chi ha prenotato.
//
// Servono a una cosa sola: fare in modo che il cliente abbia in mano la sua
// prenotazione. Finche' l'unico modo per ritrovarla era salvarsi il link, chi
// chiudeva la pagina restava senza — e per disdire doveva telefonare, che e'
// esattamente la telefonata che questo modulo dovrebbe togliere.

export type TipoAvviso = "ricevuta" | "confermata" | "spostata" | "annullata";

export type PrenotazioneAvviso = {
  nome: string;
  email: string | null;
  startsAt: Date;
  partySize: number;
  tableNumbers: number[];
  token: string;
  previousStartsAt?: Date | null;
};

export function linkPrenotazione(slug: string, token: string): string {
  return linkDelLocale(slug, `/prenota/`);
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

function persone(n: number): string {
  return `${n} ${n === 1 ? "persona" : "persone"}`;
}

type Testo = { oggetto: string; apertura: string; azione: string; chiusura: string };

function contenuto(
  tipo: TipoAvviso,
  p: PrenotazioneAvviso,
  m: MittenteLocale
): Testo {
  const q = quando(p.startsAt);

  switch (tipo) {
    case "ricevuta":
      return {
        oggetto: `Richiesta ricevuta — ${q}`,
        apertura: `Abbiamo ricevuto la tua richiesta di tavolo per ${q}, ${persone(
          p.partySize
        )}. Te la confermiamo noi a breve: fino ad allora il tavolo è tenuto da parte.`,
        azione: "Vedi la richiesta",
        chiusura:
          "Da quella pagina puoi anche disdire, se nel frattempo cambia qualcosa.",
      };
    case "confermata":
      return {
        oggetto: `Tavolo confermato — ${q}`,
        apertura: `Il tavolo è tuo: ${q}, ${persone(p.partySize)}${
          etichettaTavoli(p.tableNumbers) ? `, ${etichettaTavoli(p.tableNumbers)}` : ""
        }.`,
        azione: "Vedi la prenotazione",
        chiusura:
          "Se non riesci più a venire, disdici da quella pagina: il tavolo torna libero per qualcun altro.",
      };
    case "spostata":
      return {
        oggetto: `Prenotazione spostata — ${q}`,
        apertura: [
          p.previousStartsAt
            ? `Avevi chiesto ${quando(p.previousStartsAt)}.`
            : "Abbiamo dovuto cambiare la tua prenotazione.",
          `Possiamo tenerti il tavolo ${q}, ${persone(p.partySize)}.`,
          "Ci serve un tuo cenno: apri la pagina e dicci se ti va bene.",
        ].join(" "),
        azione: "Accetta o rifiuta",
        chiusura:
          "Finché non rispondi il tavolo resta bloccato per te. Se l'orario non ti va, dalla stessa pagina puoi rifiutare.",
      };
    case "annullata":
      return {
        oggetto: `Prenotazione annullata — ${q}`,
        apertura: `La prenotazione di ${q}, ${persone(
          p.partySize
        )}, è stata annullata.`,
        azione: "Prenota un altro tavolo",
        chiusura: m.telefono
          ? `Se è un errore o vuoi un altro orario, chiamaci allo ${m.telefono}.`
          : "Se è un errore, rispondi a questa mail.",
      };
  }
}

// Quello che va nel foglio comune (lib/mittente.ts): qui si decide solo cosa
// scriverci dentro, non come si presenta.
function corpo(
  t: Testo,
  p: PrenotazioneAvviso,
  m: MittenteLocale,
  link: string
): CorpoMail {
  const righe: [string, string][] = [
    ["Quando", quando(p.startsAt)],
    ["Persone", persone(p.partySize)],
  ];
  const tavoli = etichettaTavoli(p.tableNumbers);
  if (tavoli) righe.push(["Posto", tavoli]);
  righe.push(["A nome di", p.nome]);

  return {
    occhiello: m.nome,
    titolo: t.oggetto.split(" — ")[0],
    saluto: `Ciao ${p.nome},`,
    apertura: t.apertura,
    righe,
    azione: t.azione,
    link,
    chiusura: t.chiusura,
    nota: m.nota,
    firma: [m.nome, m.indirizzo, m.telefono].filter(Boolean).join(" · "),
    piede: `Ricevi questa mail perché hai prenotato un tavolo da ${m.nome}.`,
  };
}

export function riepilogoBreve(p: PrenotazioneAvviso): string {
  return [
    quando(p.startsAt),
    persone(p.partySize),
    etichettaTavoli(p.tableNumbers),
    p.nome,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Manda l'avviso. Torna `false` senza rumore quando non c'e' niente da mandare
// — locale senza posta configurata, o cliente che non ha lasciato un indirizzo
// — perche' quello non e' un errore: la prenotazione vale lo stesso.
export async function avvisaCliente(
  tipo: TipoAvviso,
  p: PrenotazioneAvviso,
  m: MittenteLocale | null
): Promise<boolean> {
  if (!m?.smtp || !p.email) return false;

  const link = linkPrenotazione(m.slug, p.token);
  const t = contenuto(tipo, p, m);

  try {
    await inviaMailLocale(m.smtp, {
      a: p.email,
      oggetto: `${t.oggetto} — ${m.nome}`,
      testo: mailTesto(corpo(t, p, m, link)),
      html: mailHtml(corpo(t, p, m, link)),
    });
    return true;
  } catch (e) {
    // Una mail che non parte non deve far fallire la prenotazione: il tavolo
    // e' preso comunque, e in pannello si vede che l'avviso non e' uscito.
    console.error("[prenotazioni] mail non inviata", e);
    return false;
  }
}
