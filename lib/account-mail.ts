import { configSmtp, inviaMailLocale, inviaMailPiattaforma } from "@/lib/mail";
import { mittenteLocale } from "@/lib/prenotazioni-mail";

// Le mail che riguardano l'accesso: l'invito a un locale nuovo, la password
// temporanea di un reset, il codice del secondo fattore.
//
// Partono dalla nostra casella e non da quella del locale: parlano
// dell'account, non del ristorante, e al primo giorno il locale una casella
// configurata non ce l'ha ancora. Se la nostra non c'e', si ripiega sulla sua
// invece di perdere la mail — meglio un invito che arriva dall'indirizzo del
// ristorante che un invito che non arriva.

export type EsitoInvio = "inviata" | "senza-posta" | "errore";

export function linkAccesso(slug: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${slug}.${root}/login`;
}

/** Il link per rifare la password, dentro il sito del locale. */
export function linkReset(slug: string, token: string): string {
  return `${linkAccesso(slug)}/recupero/${token}`;
}

async function spedisci(
  tenantId: string | null,
  m: { a: string; oggetto: string; testo: string; html: string }
): Promise<EsitoInvio> {
  try {
    if (configSmtp()) {
      await inviaMailPiattaforma(m);
      return "inviata";
    }
    if (tenantId) {
      const loc = await mittenteLocale(tenantId);
      if (loc?.smtp) {
        await inviaMailLocale(loc.smtp, m);
        return "inviata";
      }
    }
    return "senza-posta";
  } catch (e) {
    // Chi ha chiesto l'invio deve poterlo dire in pagina: una password
    // resettata e una mail non partita e' una persona chiusa fuori che non
    // sa di esserlo.
    console.error("[account] mail non inviata", e);
    return "errore";
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// HTML con gli stili in riga e nessuna immagine: i client di posta ignorano i
// fogli di stile e bloccano le immagini finche' non le si sblocca a mano.
function pagina(o: {
  occhiello: string;
  titolo: string;
  testo: string[];
  righe: [string, string][];
  azione?: { testo: string; link: string };
  chiusura: string;
}): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e7e4;border-radius:14px">
<tr><td style="padding:24px">
<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b66">${esc(o.occhiello)}</div>
<h1 style="margin:8px 0 0;font-size:22px;line-height:1.25">${esc(o.titolo)}</h1>
${o.testo
  .map(
    (p) =>
      `<p style="margin:14px 0 0;font-size:15px;line-height:1.6">${esc(p)}</p>`
  )
  .join("")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;font-size:14px">
${o.righe
  .map(
    ([k, v]) =>
      `<tr><td style="padding:8px 0;border-top:1px solid #e7e7e4;color:#6b6b66">${esc(
        k
      )}</td><td style="padding:8px 0;border-top:1px solid #e7e7e4;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:600">${esc(
        v
      )}</td></tr>`
  )
  .join("")}
</table>
${
  o.azione
    ? `<p style="margin:24px 0 0"><a href="${o.azione.link}" style="display:inline-block;padding:12px 20px;border-radius:11px;background:#1c1c1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">${esc(
        o.azione.testo
      )}</a></p>`
    : ""
}
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b6b66">${esc(o.chiusura)}</p>
</td></tr></table>
<p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#6b6b66;text-align:center">Comanda — gestione del locale</p>
</body></html>`;
}

export type Credenziali = {
  /** Dove arriva la mail. */
  a: string;
  /** Nome del locale, o "Comanda" per l'account di servizio. */
  nome: string;
  /** Pagina di accesso. */
  link: string;
  /** Con quale indirizzo si entra. */
  utente: string;
  passwordTemporanea: string;
  giorni: number;
  /** Locale su cui ripiegare se la nostra posta non c'e'. */
  tenantId?: string | null;
};

export async function inviaInvito(c: Credenziali): Promise<EsitoInvio> {
  const testo = [
    `${c.nome} è pronto su Comanda.`,
    "Qui sotto trovi le credenziali per entrare nella gestione del locale: ordini, menu, tavoli e QR.",
    `La password è temporanea e vale ${c.giorni} giorni: al primo accesso ti viene chiesto di sceglierne una tua.`,
  ];
  const righe: [string, string][] = [
    ["Indirizzo", c.link],
    ["Email", c.utente],
    ["Password temporanea", c.passwordTemporanea],
  ];
  const chiusura =
    "Se non aspettavi questa mail, ignorala: senza la password qui sopra non entra nessuno.";

  return spedisci(c.tenantId ?? null, {
    a: c.a,
    oggetto: `Il tuo accesso a ${c.nome}`,
    testo: [
      ...testo,
      "",
      ...righe.map(([k, v]) => `${k}: ${v}`),
      "",
      chiusura,
    ].join("\n"),
    html: pagina({
      occhiello: c.nome,
      titolo: "Il tuo accesso è pronto",
      testo,
      righe,
      azione: { testo: "Entra nella gestione", link: c.link },
      chiusura,
    }),
  });
}

export async function inviaReset(c: Credenziali): Promise<EsitoInvio> {
  const testo = [
    "Abbiamo azzerato la password del tuo accesso a Comanda.",
    `Entra con la password temporanea qui sotto: vale ${c.giorni} giorni, e appena entri ti viene chiesto di sceglierne una nuova.`,
  ];
  const righe: [string, string][] = [
    ["Indirizzo", c.link],
    ["Email", c.utente],
    ["Password temporanea", c.passwordTemporanea],
  ];
  const chiusura =
    "Se non l'hai chiesto tu, cambia la password appena entri e avvisaci: qualcuno conosce il tuo indirizzo.";

  return spedisci(c.tenantId ?? null, {
    a: c.a,
    oggetto: `Password temporanea per ${c.nome}`,
    testo: [...testo, "", ...righe.map(([k, v]) => `${k}: ${v}`), "", chiusura].join(
      "\n"
    ),
    html: pagina({
      occhiello: c.nome,
      titolo: "Password temporanea",
      testo,
      righe,
      azione: { testo: "Vai all'accesso", link: c.link },
      chiusura,
    }),
  });
}

/** "Ho perso la password": il link per sceglierne una nuova.
 *
 *  Non contiene nessuna password, e finché non lo si apre non è cambiato
 *  niente: chi riceve questa mail senza averla chiesta può buttarla via e
 *  continuare a entrare come sempre. */
export async function inviaLinkReset(o: {
  a: string;
  nome: string;
  link: string;
  minuti: number;
  tenantId?: string | null;
}): Promise<EsitoInvio> {
  const ore = Math.round(o.minuti / 60);
  const durata = ore >= 1 ? `${ore} ${ore === 1 ? "ora" : "ore"}` : `${o.minuti} minuti`;

  const testo = [
    `Qualcuno ha chiesto di rifare la password per entrare in ${o.nome}.`,
    `Apri il link qui sotto e scegline una nuova: vale ${durata} e funziona una volta sola.`,
  ];
  const chiusura =
    "Se non l'hai chiesto tu, ignora questa mail: la tua password è ancora quella di prima e non è successo niente.";

  return spedisci(o.tenantId ?? null, {
    a: o.a,
    oggetto: `Rifai la password di ${o.nome}`,
    testo: [...testo, "", o.link, "", chiusura].join("\n"),
    html: pagina({
      occhiello: o.nome,
      titolo: "Rifai la password",
      testo,
      righe: [["Valido", durata]],
      azione: { testo: "Scegli una nuova password", link: o.link },
      chiusura,
    }),
  });
}

/** Il codice del secondo fattore, per chi ha scelto la verifica via mail. */
export async function inviaCodiceAccesso(o: {
  a: string;
  nome: string;
  codice: string;
  minuti: number;
  tenantId?: string | null;
}): Promise<EsitoInvio> {
  const testo = [
    `Qualcuno sta entrando in ${o.nome} con la tua password.`,
    `Il codice di verifica è ${o.codice} e vale ${o.minuti} minuti.`,
  ];
  const chiusura =
    "Se non stai entrando tu, la tua password non è più un segreto: cambiala appena puoi.";

  return spedisci(o.tenantId ?? null, {
    a: o.a,
    oggetto: `Codice di accesso: ${o.codice}`,
    testo: [...testo, "", chiusura].join("\n"),
    html: pagina({
      occhiello: o.nome,
      titolo: "Codice di accesso",
      testo: [testo[0]],
      righe: [
        ["Codice", o.codice],
        ["Valido", `${o.minuti} minuti`],
      ],
      chiusura,
    }),
  });
}
