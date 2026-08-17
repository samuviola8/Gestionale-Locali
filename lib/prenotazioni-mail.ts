import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { decifra } from "@/lib/segreti";
import { inviaMailLocale, type ConfigMailLocale } from "@/lib/mail";
import { etichettaTavoli } from "@/lib/prenotazioni";

// Le mail che il locale manda a chi ha prenotato.
//
// Servono a una cosa sola: fare in modo che il cliente abbia in mano la sua
// prenotazione. Finche' l'unico modo per ritrovarla era salvarsi il link, chi
// chiudeva la pagina restava senza — e per disdire doveva telefonare, che e'
// esattamente la telefonata che questo modulo dovrebbe togliere.

export type TipoAvviso = "ricevuta" | "confermata" | "spostata" | "annullata";

export type MittenteLocale = {
  nome: string;
  slug: string;
  telefono: string | null;
  indirizzo: string | null;
  nota: string | null;
  smtp: ConfigMailLocale | null;
};

export type PrenotazioneAvviso = {
  nome: string;
  email: string | null;
  startsAt: Date;
  partySize: number;
  tableNumbers: number[];
  token: string;
  previousStartsAt?: Date | null;
};

// Il locale come mittente. La password si decifra qui e non esce da questo
// giro: nessuna pagina la riceve, nessuna azione la rimanda al browser.
export async function mittenteLocale(
  tenantId: string
): Promise<MittenteLocale | null> {
  const [r] = await db
    .select({
      nome: tenants.name,
      slug: tenants.slug,
      telefono: tenants.phone,
      address: tenants.address,
      city: tenants.city,
      nota: tenants.reservationNote,
      smtpHost: tenants.smtpHost,
      smtpPort: tenants.smtpPort,
      smtpUser: tenants.smtpUser,
      smtpPass: tenants.smtpPass,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!r) return null;

  const pass = decifra(r.smtpPass);
  return {
    nome: r.nome,
    slug: r.slug,
    telefono: r.telefono,
    indirizzo: [r.address, r.city].filter(Boolean).join(", ") || null,
    nota: r.nota,
    smtp:
      r.smtpHost && r.smtpUser && pass
        ? {
            host: r.smtpHost,
            port: r.smtpPort,
            user: r.smtpUser,
            pass,
            mittente: r.nome,
          }
        : null,
  };
}

export function linkPrenotazione(slug: string, token: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${slug}.${root}/prenota/${token}`;
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

function corpoTesto(t: Testo, p: PrenotazioneAvviso, m: MittenteLocale, link: string): string {
  return [
    `Ciao ${p.nome},`,
    t.apertura,
    `${t.azione}: ${link}`,
    t.chiusura,
    m.nota ?? "",
    [m.nome, m.indirizzo, m.telefono].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// HTML scritto a mano e con gli stili in riga: i client di posta ignorano i
// fogli di stile, e meta' di loro pure le classi. Niente immagini: quelle
// restano bloccate finche' il destinatario non le sblocca.
function corpoHtml(t: Testo, p: PrenotazioneAvviso, m: MittenteLocale, link: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const righe: [string, string][] = [
    ["Quando", quando(p.startsAt)],
    ["Persone", persone(p.partySize)],
  ];
  const tavoli = etichettaTavoli(p.tableNumbers);
  if (tavoli) righe.push(["Posto", tavoli]);
  righe.push(["A nome di", p.nome]);

  // Il charset va dichiarato nel documento e non solo nell'intestazione MIME:
  // qualche client di posta legge solo questo, e senza gli accenti italiani
  // arrivano a pezzi.
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e7e4;border-radius:14px">
<tr><td style="padding:24px">
<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b66">${esc(m.nome)}</div>
<h1 style="margin:8px 0 0;font-size:22px;line-height:1.25">${esc(t.oggetto.split(" — ")[0])}</h1>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6">Ciao ${esc(p.nome)},</p>
<p style="margin:6px 0 0;font-size:15px;line-height:1.6">${esc(t.apertura)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;font-size:14px">
${righe
  .map(
    ([k, v]) =>
      `<tr><td style="padding:8px 0;border-top:1px solid #e7e7e4;color:#6b6b66">${esc(
        k
      )}</td><td style="padding:8px 0;border-top:1px solid #e7e7e4;text-align:right;font-weight:600">${esc(
        v
      )}</td></tr>`
  )
  .join("")}
</table>
<p style="margin:24px 0 0"><a href="${link}" style="display:inline-block;padding:12px 20px;border-radius:11px;background:#1c1c1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">${esc(
    t.azione
  )}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b6b66">${esc(t.chiusura)}</p>
${m.nota ? `<p style="margin:12px 0 0;font-size:13px;color:#6b6b66">${esc(m.nota)}</p>` : ""}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e7e7e4;font-size:12px;color:#6b6b66">${esc(
    [m.nome, m.indirizzo, m.telefono].filter(Boolean).join(" · ")
  )}</p>
</td></tr></table>
<p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#6b6b66;text-align:center">Ricevi questa mail perché hai prenotato un tavolo da ${esc(
    m.nome
  )}.</p>
</body></html>`;
}

// Avviso al locale sulla propria casella. Serve per le cose che succedono
// mentre nessuno guarda il pannello: un tavolo disdetto la mattina e' un
// tavolo che si puo' rivendere solo se qualcuno lo viene a sapere.
export async function avvisaLocale(
  m: MittenteLocale | null,
  oggetto: string,
  testo: string
): Promise<void> {
  if (!m?.smtp) return;
  try {
    await inviaMailLocale(m.smtp, { a: m.smtp.user, oggetto, testo });
  } catch (e) {
    console.error("[prenotazioni] avviso al locale non inviato", e);
  }
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
      testo: corpoTesto(t, p, m, link),
      html: corpoHtml(t, p, m, link),
    });
    return true;
  } catch (e) {
    // Una mail che non parte non deve far fallire la prenotazione: il tavolo
    // e' preso comunque, e in pannello si vede che l'avviso non e' uscito.
    console.error("[prenotazioni] mail non inviata", e);
    return false;
  }
}
