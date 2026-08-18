import { inviaMail } from "@/lib/mail";

// Avvisi che arrivano a me, non ai locali.
//
// Telegram per primo: e' una POST a un indirizzo, senza librerie e senza
// account da pagare, e la notifica squilla sul telefono nel momento in cui
// qualcuno segnala qualcosa. Una mail, invece, la si legge quando si apre la
// posta — che per una cosa da sistemare "tempestivamente" e' troppo tardi.
//
// La mail resta come rete: se il bot non e' configurato, o Telegram e' giu',
// l'avviso passa di li'. Se non funziona neanche quella la segnalazione e'
// comunque salvata a database: e' quella la copia che non si perde.

const TIMEOUT_MS = 8000;

export type Avviso = {
  titolo: string;
  righe: string[];
  /** Dove si va per rispondere. */
  link?: string;
};

function componi(a: Avviso): string {
  return [a.titolo, "", ...a.righe, ...(a.link ? ["", a.link] : [])].join("\n");
}

async function perTelegram(testo: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chat) return false;

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Testo semplice, senza Markdown: il messaggio lo scrive chi sta dietro
      // al bancone, e un asterisco o un underscore di troppo farebbero
      // rifiutare l'intero messaggio da Telegram.
      body: JSON.stringify({
        chat_id: chat,
        text: testo,
        disable_web_page_preview: true,
      }),
      // Senza scadenza, una chiamata appesa terrebbe fermo lo staff che ha
      // premuto "invia" e sta aspettando la conferma.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      console.error("[avvisi] telegram", r.status, await r.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[avvisi] telegram non raggiungibile", e);
    return false;
  }
}

async function perMail(a: Avviso, testo: string): Promise<boolean> {
  try {
    await inviaMail({
      oggetto: a.titolo,
      testo,
      nomeVisibile: "Comanda",
    });
    return true;
  } catch (e) {
    console.error("[avvisi] mail non partita", e);
    return false;
  }
}

/**
 * Manda l'avviso sul primo canale disponibile. Non solleva mai: chi chiama
 * ha gia' salvato il fatto, e non deve fallire perche' la notifica non parte.
 */
export async function avvisa(a: Avviso): Promise<"telegram" | "mail" | null> {
  const testo = componi(a);
  if (await perTelegram(testo)) return "telegram";
  if (await perMail(a, testo)) return "mail";
  console.error("[avvisi] nessun canale configurato:", a.titolo);
  return null;
}
