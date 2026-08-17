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
