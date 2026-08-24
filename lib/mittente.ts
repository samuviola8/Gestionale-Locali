import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { decifra } from "@/lib/segreti";
import { inviaMailLocale, type ConfigMailLocale } from "@/lib/mail";
import { normalizzaCanale } from "@/lib/ordini-web";

// Il locale come mittente delle mail ai suoi clienti.
//
// Sta a parte dalle prenotazioni perche' non e' roba loro: la stessa casella
// manda la conferma di un tavolo e quella di un asporto, e la password si
// decifra in un posto solo. Da qui non esce mai: nessuna pagina la riceve,
// nessuna azione la rimanda al browser.

export type MittenteLocale = {
  nome: string;
  slug: string;
  telefono: string | null;
  indirizzo: string | null;
  // La riga che il locale vuole in fondo alle sue mail. Cambia a seconda di
  // cosa si sta confermando: «il tavolo si tiene 15 minuti» non c'entra niente
  // con un ordine d'asporto.
  nota: string | null;
  smtp: ConfigMailLocale | null;
};

export type QualeNota = "prenotazione" | "asporto" | "domicilio";

export async function mittenteLocale(
  tenantId: string,
  quale: QualeNota = "prenotazione"
): Promise<MittenteLocale | null> {
  const [r] = await db
    .select({
      nome: tenants.name,
      slug: tenants.slug,
      telefono: tenants.phone,
      address: tenants.address,
      city: tenants.city,
      notaPrenotazione: tenants.reservationNote,
      canaliWeb: tenants.webOrderChannels,
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
    // La nota degli ordini vive dentro il blocco del canale: quella del ritiro
    // e quella della consegna sono due frasi diverse, e in fondo alla mail ci
    // va quella del canale che si sta confermando.
    nota:
      quale === "prenotazione"
        ? r.notaPrenotazione
        : normalizzaCanale(
            ((r.canaliWeb ?? {}) as Record<string, unknown>)[quale],
            quale
          ).nota,
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

// L'indirizzo pubblico di una pagina del locale, per i link dentro le mail.
export function linkDelLocale(slug: string, percorso: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${proto}://${slug}.${root}${percorso}`;
}

// Avviso al locale sulla propria casella. Serve per le cose che succedono
// mentre nessuno guarda il pannello: un tavolo disdetto la mattina, o un
// ordine arrivato dal sito mentre la coda e' su un altro schermo.
export async function avvisaLocale(
  m: MittenteLocale | null,
  oggetto: string,
  testo: string
): Promise<void> {
  if (!m?.smtp) return;
  try {
    await inviaMailLocale(m.smtp, { a: m.smtp.user, oggetto, testo });
  } catch (e) {
    console.error("[mail] avviso al locale non inviato", e);
  }
}

// --- Il foglio su cui sono scritte tutte le mail del locale ------------------
//
// Uno solo, per prenotazioni e ordini: sono due cose diverse ma le manda la
// stessa insegna, e due modelli separati invecchiano separatamente — un giorno
// uno ha il logo e l'altro no, uno il telefono in fondo e l'altro no.

export type CorpoMail = {
  /** Il nome del locale, in cima e piccolo. */
  occhiello: string;
  titolo: string;
  /** "Ciao Marco," */
  saluto: string;
  apertura: string;
  /** Le due colonne del riquadro: "Quando" / "domani alle 20:30". */
  righe: [string, string][];
  azione: string;
  link: string;
  chiusura: string;
  nota?: string | null;
  /** "Locale · via · telefono" */
  firma: string;
  /** Perche' questa mail e' arrivata. */
  piede: string;
};

export function mailTesto(c: CorpoMail): string {
  return [
    c.saluto,
    c.apertura,
    c.righe.map(([k, v]) => `${k}: ${v}`).join("\n"),
    `${c.azione}: ${c.link}`,
    c.chiusura,
    c.nota ?? "",
    c.firma,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// HTML scritto a mano e con gli stili in riga: i client di posta ignorano i
// fogli di stile, e meta' di loro pure le classi. Niente immagini: quelle
// restano bloccate finche' il destinatario non le sblocca.
export function mailHtml(c: CorpoMail): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Il charset va dichiarato nel documento e non solo nell'intestazione MIME:
  // qualche client di posta legge solo questo, e senza gli accenti italiani
  // arrivano a pezzi.
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:24px;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e7e4;border-radius:14px">
<tr><td style="padding:24px">
<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b66">${esc(c.occhiello)}</div>
<h1 style="margin:8px 0 0;font-size:22px;line-height:1.25">${esc(c.titolo)}</h1>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6">${esc(c.saluto)}</p>
<p style="margin:6px 0 0;font-size:15px;line-height:1.6">${esc(c.apertura)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;font-size:14px">
${c.righe
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
<p style="margin:24px 0 0"><a href="${c.link}" style="display:inline-block;padding:12px 20px;border-radius:11px;background:#1c1c1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">${esc(
    c.azione
  )}</a></p>
<p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b6b66">${esc(c.chiusura)}</p>
${c.nota ? `<p style="margin:12px 0 0;font-size:13px;color:#6b6b66">${esc(c.nota)}</p>` : ""}
<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e7e7e4;font-size:12px;color:#6b6b66">${esc(
    c.firma
  )}</p>
</td></tr></table>
<p style="max-width:520px;margin:12px auto 0;font-size:11px;color:#6b6b66;text-align:center">${esc(
    c.piede
  )}</p>
</body></html>`;
}
