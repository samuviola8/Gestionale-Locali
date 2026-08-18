import { createHash } from "crypto";
import nodemailer, { type Transporter } from "nodemailer";

// Invio delle mail di servizio (per ora: le richieste dalla vetrina).
//
// Si appoggia a una casella vera via SMTP con una password per applicazione,
// non a un servizio esterno: e' una mail ogni tanto, e cosi' le richieste
// arrivano nella stessa casella da cui si risponde, senza account in piu' da
// mantenere e senza che i messaggi passino da terzi.

export type ConfigSmtp = {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Casella che riceve le richieste. */
  a: string;
  /** Mittente. Gmail riscrive comunque il From sull'utente autenticato. */
  da: string;
};

// Indirizzo mostrato in pagina quando il modulo non puo' funzionare: e' l'unico
// valore scritto nel codice, il resto vive nell'ambiente.
const INDIRIZZO_DI_RISERVA = "samu.viola8@gmail.com";

export function configSmtp(): ConfigSmtp | null {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  // Senza credenziali il modulo resta muto invece di fingere di funzionare:
  // una richiesta persa in silenzio e' peggio di un indirizzo da copiare.
  if (!user || !pass) return null;

  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 465,
    user,
    pass,
    a: process.env.MAIL_TO?.trim() || user,
    da: process.env.MAIL_FROM?.trim() || user,
  };
}

/** Indirizzo da mostrare come alternativa al modulo. */
export function indirizzoContatto(): string {
  return (
    process.env.MAIL_TO?.trim() ||
    process.env.SMTP_USER?.trim() ||
    INDIRIZZO_DI_RISERVA
  );
}

// Il trasporto tiene aperta una connessione riusabile: si crea una volta sola
// per processo, non a ogni richiesta.
let trasporto: Transporter | null = null;

function creaTrasporto(cfg: ConfigSmtp): Transporter {
  if (!trasporto) {
    trasporto = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      // 465 e' TLS dal primo byte, 587 parte in chiaro e sale con STARTTLS.
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }
  return trasporto;
}

// Un valore che finisce in un'intestazione non puo' contenere a capo: sarebbe
// il modo per farci spedire mail a indirizzi che non abbiamo scelto noi.
function unaRigaSola(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

// --- Posta di un locale ------------------------------------------------------
//
// Le conferme di prenotazione non partono dalla nostra casella: il cliente ha
// prenotato al ristorante, e la mail deve arrivare da li' — con il nome giusto
// nella posta in arrivo e, se risponde, una risposta che finisce al locale e
// non a noi.

export type ConfigMailLocale = {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** Nome mostrato al destinatario: quello del locale. */
  mittente: string;
};

// Un trasporto per casella, tenuto aperto fra una mail e l'altra. La chiave
// include l'impronta della password: cambiandola, il trasporto vecchio non
// viene riusato con le credenziali di ieri.
const trasportiLocali = new Map<string, Transporter>();

function trasportoLocale(cfg: ConfigMailLocale): Transporter {
  const impronta = createHash("sha256").update(cfg.pass).digest("hex").slice(0, 12);
  const chiave = `${cfg.host}:${cfg.port}:${cfg.user}:${impronta}`;

  let t = trasportiLocali.get(chiave);
  if (!t) {
    t = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    // Una manciata di caselle per installazione: la mappa non cresce, ma se un
    // locale cambia password dieci volte i trasporti vecchi restano appesi.
    if (trasportiLocali.size > 20) trasportiLocali.clear();
    trasportiLocali.set(chiave, t);
  }
  return t;
}

export async function inviaMailLocale(
  cfg: ConfigMailLocale,
  m: { a: string; oggetto: string; testo: string; html?: string }
): Promise<void> {
  await trasportoLocale(cfg).sendMail({
    from: { name: unaRigaSola(cfg.mittente), address: cfg.user },
    to: unaRigaSola(m.a),
    subject: unaRigaSola(m.oggetto),
    text: m.testo,
    html: m.html,
    // Chi risponde alla conferma scrive al locale: e' la cosa che la gente fa
    // per dire "siamo in cinque e non in quattro".
    replyTo: cfg.user,
  });
}

// Verifica delle credenziali senza mandare niente a nessuno. Serve al pulsante
// "prova la connessione": scoprire che la password e' sbagliata alla prima
// prenotazione vuol dire un cliente che non riceve la conferma.
export async function provaMailLocale(cfg: ConfigMailLocale): Promise<void> {
  await trasportoLocale(cfg).verify();
}

/** Una mail dalla nostra casella a un destinatario qualsiasi.
 *
 *  `inviaMail` qui sotto scrive sempre e solo a noi: e' il modulo della
 *  vetrina che ci recapita le richieste. Gli inviti e le password temporanee
 *  vanno invece a chi gestisce il locale, e devono partire da noi anche
 *  quando il locale la posta non ce l'ha ancora configurata — al primo
 *  accesso non ce l'ha mai. */
export async function inviaMailPiattaforma(m: {
  a: string;
  oggetto: string;
  testo: string;
  html?: string;
}): Promise<void> {
  const cfg = configSmtp();
  if (!cfg) throw new Error("SMTP non configurato");

  await creaTrasporto(cfg).sendMail({
    from: { name: "Comanda", address: cfg.da },
    to: unaRigaSola(m.a),
    subject: unaRigaSola(m.oggetto),
    text: m.testo,
    html: m.html,
    // Chi risponde a un invito scrive a noi: e' assistenza, non posta del
    // locale.
    replyTo: cfg.a,
  });
}

export async function inviaMail(m: {
  oggetto: string;
  testo: string;
  rispondiA?: string;
  /** Nome da mostrare al posto del nostro nella lista dei messaggi. */
  nomeVisibile?: string;
}): Promise<void> {
  const cfg = configSmtp();
  if (!cfg) throw new Error("SMTP non configurato");

  await creaTrasporto(cfg).sendMail({
    // L'indirizzo del mittente resta il nostro — Gmail lo riscrive comunque
    // sull'account autenticato — ma il nome mostrato e' quello di chi scrive:
    // nella posta in arrivo si legge chi ha compilato il modulo invece di
    // vedere una fila di messaggi partiti da noi stessi.
    from: { name: unaRigaSola(m.nomeVisibile || "Comanda"), address: cfg.da },
    to: cfg.a,
    subject: unaRigaSola(m.oggetto),
    text: m.testo,
    // Rispondere alla mail scrive direttamente a chi ha compilato il modulo.
    replyTo: m.rispondiA ? unaRigaSola(m.rispondiA) : undefined,
  });
}
