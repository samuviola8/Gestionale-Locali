import { NextResponse } from "next/server";
import { configSmtp, inviaMail } from "@/lib/mail";

// Richieste dalla vetrina. E' l'unica rotta aperta a chiunque passi di qui, e
// dietro c'e' una casella vera: tutto quello che segue serve a non farla
// diventare un megafono per gli spammer.

export const runtime = "nodejs";

const LIMITE_PER_FINESTRA = 3;
const FINESTRA_MS = 10 * 60 * 1000;

// Contatore in memoria: il sito gira su un processo solo, e per fermare
// l'invio ripetuto dallo stesso browser basta e avanza. Se un giorno i
// processi diventano due, questo diventa un contatore per processo.
const invii = new Map<string, number[]>();

function troppeRichieste(ip: string): boolean {
  const ora = Date.now();
  const recenti = (invii.get(ip) ?? []).filter((t) => ora - t < FINESTRA_MS);
  if (recenti.length >= LIMITE_PER_FINESTRA) {
    invii.set(ip, recenti);
    return true;
  }
  recenti.push(ora);
  invii.set(ip, recenti);

  // Pulizia opportunista: senza, la mappa cresce per sempre.
  if (invii.size > 500) {
    for (const [chiave, tempi] of invii) {
      if (tempi.every((t) => ora - t >= FINESTRA_MS)) invii.delete(chiave);
    }
  }
  return false;
}

function chiEChiama(req: Request): string {
  // Davanti c'e' il proxy che fa HTTPS: l'indirizzo vero e' nell'intestazione.
  const inoltrato = req.headers.get("x-forwarded-for");
  return inoltrato?.split(",")[0]?.trim() || "sconosciuto";
}

function testo(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

const EMAIL_VALIDA = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  if (!configSmtp()) {
    return NextResponse.json(
      { errore: "Il modulo non e' attivo in questo momento." },
      { status: 503 }
    );
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  const c = corpo as Record<string, unknown>;
  const nome = testo(c.nome);
  const email = testo(c.email);
  const locale = testo(c.locale);
  const telefono = testo(c.telefono);
  const messaggio = testo(c.messaggio);
  const esca = testo(c.sito);

  // Campo invisibile: un umano non lo vede e non lo compila, i robot che
  // riempiono ogni input si tradiscono qui. Rispondiamo ok per non insegnare
  // loro dov'e' il controllo.
  if (esca) return NextResponse.json({ ok: true });

  if (nome.length < 2 || nome.length > 80) {
    return NextResponse.json({ errore: "Scrivi il tuo nome." }, { status: 400 });
  }
  if (!EMAIL_VALIDA.test(email) || email.length > 160) {
    return NextResponse.json(
      { errore: "Controlla l'indirizzo email: e' l'unico modo per risponderti." },
      { status: 400 }
    );
  }
  if (messaggio.length < 10 || messaggio.length > 2000) {
    return NextResponse.json(
      { errore: "Raccontaci in due righe cosa ti serve." },
      { status: 400 }
    );
  }
  if (locale.length > 120 || telefono.length > 40) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  if (troppeRichieste(chiEChiama(req))) {
    return NextResponse.json(
      { errore: "Hai gia' inviato la richiesta. Ti rispondiamo a breve." },
      { status: 429 }
    );
  }

  try {
    await inviaMail({
      // L'indirizzo sta nell'oggetto e non solo nel corpo: e' la riga che si
      // legge dalla lista dei messaggi, senza aprire niente.
      oggetto: `Comanda — ${nome}${locale ? ` (${locale})` : ""} — ${email}`,
      nomeVisibile: `${nome} via Comanda`,
      rispondiA: email,
      rispondiANome: nome,
      // I recapiti in cima, poi il messaggio staccato: i blocchi si uniscono
      // con la riga vuota in mezzo, altrimenti arriva tutto attaccato.
      testo: [
        [
          `Email: ${email}`,
          telefono && `Telefono: ${telefono}`,
          `Nome: ${nome}`,
          locale && `Locale: ${locale}`,
        ]
          .filter(Boolean)
          .join("\n"),
        messaggio,
        "— Rispondendo a questa mail scrivi direttamente a chi l'ha mandata.",
      ].join("\n\n"),
    });
  } catch (e) {
    console.error("[contatti] invio fallito", e);
    return NextResponse.json(
      { errore: "Non siamo riusciti a inviare il messaggio." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
