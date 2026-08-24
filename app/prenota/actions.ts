"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reservations } from "@/lib/db/schema";
import {
  contestoPrenotazione,
  dentroFinestra,
  disponibilita,
  fascePrenotabili,
  occupazioniDelGiorno,
  orarioValido,
  salvaPrenotazione,
  tavoliPrenotabili,
} from "@/lib/prenotazioni";
import {
  avvisaCliente,
  avvisaLocale,
  mittenteLocale,
  riepilogoBreve,
} from "@/lib/prenotazioni-mail";
import { troppeRichieste } from "@/lib/limite";

// Le azioni della pagina pubblica di prenotazione. Sono aperte a chiunque
// conosca l'indirizzo del locale: qui dentro non ci si fida di niente di
// quello che arriva dal browser, nemmeno del tavolo proposto un attimo prima.

const LIMITE_PER_FINESTRA = 5;
const FINESTRA_MS = 30 * 60 * 1000;

// Il contatore vive in lib/limite.ts: lo stesso freno lo usano l'ordine dal
// sito e la ricerca degli indirizzi, e tre copie della stessa funzione sono
// tre posti dove sistemarla il giorno che non basta piu'.

async function chiChiama(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "sconosciuto";
}

function pulisci(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

const EMAIL_VALIDA = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO_VALIDO = /^[0-9+().\s-]{6,32}$/;

// Perche' un giorno non ha orari. Le tre risposte sono diverse per chi legge:
// "troppo in la'", "quel giorno no" e "e' pieno" portano a tre reazioni
// diverse, e dare sempre la terza fa sembrare pieno un locale che quel giorno
// e' semplicemente chiuso.
export type MotivoVuoto = "oltre" | "chiuso" | "pieno";

export type EsitoFasce =
  | { ok: true; fasce: string[]; motivo?: MotivoVuoto }
  | { ok: false; errore: string };

// Le fasce ancora libere per un giorno e un numero di persone. Si ricalcolano
// a ogni richiesta invece di mandarle tutte in pagina: fra il caricamento e la
// scelta possono passare dieci minuti, e in dieci minuti un tavolo si prende.
export async function cercaFasce(
  giorno: string,
  persone: number
): Promise<EsitoFasce> {
  const ctx = await contestoPrenotazione();
  if (!ctx) return { ok: false, errore: "Le prenotazioni non sono attive." };

  const quando = orarioValido(giorno, "12:00");
  if (!quando) return { ok: false, errore: "Data non valida." };

  const n = Math.trunc(persone);
  if (!Number.isInteger(n) || n < ctx.cfg.minPersone || n > ctx.cfg.maxPersone) {
    return { ok: false, errore: "Numero di persone non valido." };
  }

  const adesso = new Date();
  if (!dentroFinestra(quando, adesso, ctx.cfg)) {
    return { ok: true, fasce: [], motivo: "oltre" };
  }
  if (!fascePrenotabili(ctx.orari, quando, adesso, ctx.cfg).length) {
    return { ok: true, fasce: [], motivo: "chiuso" };
  }

  const [tavoli, occupate] = await Promise.all([
    tavoliPrenotabili(ctx.tenantId),
    occupazioniDelGiorno(ctx.tenantId, quando, ctx.cfg),
  ]);

  const libere = disponibilita({
    orari: ctx.orari,
    tavoli,
    occupate,
    giorno: quando,
    adesso,
    persone: n,
    cfg: ctx.cfg,
  });

  // Al cliente va l'ora, non il tavolo: quale gli tocchi lo decide il locale,
  // e mandarlo in pagina vorrebbe dire farselo rimandare indietro modificato.
  return {
    ok: true,
    fasce: libere.map((f) => f.ora),
    motivo: libere.length ? undefined : "pieno",
  };
}

export type DatiPrenotazione = {
  giorno: string;
  ora: string;
  persone: number;
  nome: string;
  telefono: string;
  email?: string;
  note?: string;
  /** Campo esca: un umano non lo vede e non lo compila. */
  sito?: string;
};

export type EsitoInvio =
  | { ok: true; token: string }
  | { ok: false; errore: string };

export async function inviaPrenotazione(
  dati: DatiPrenotazione
): Promise<EsitoInvio> {
  const ctx = await contestoPrenotazione();
  if (!ctx) return { ok: false, errore: "Le prenotazioni non sono attive." };

  // Ai robot si risponde di sì senza scrivere niente: dire loro dov'e' il
  // controllo servirebbe solo a farglielo aggirare al tentativo dopo.
  if (pulisci(dati.sito, 40)) return { ok: true, token: "" };

  const nome = pulisci(dati.nome, 80);
  const telefono = pulisci(dati.telefono, 32);
  const email = pulisci(dati.email, 160);
  const note = pulisci(dati.note, 300);
  const persone = Math.trunc(Number(dati.persone));

  if (nome.length < 2) {
    return { ok: false, errore: "Scrivi il nome per la prenotazione." };
  }
  if (!TELEFONO_VALIDO.test(telefono)) {
    return {
      ok: false,
      errore: "Serve un telefono valido: è l'unico modo per avvisarti.",
    };
  }
  if (ctx.mailAttiva && !email) {
    return {
      ok: false,
      errore: "Serve l'email: è lì che ti arriva la conferma con il tavolo.",
    };
  }
  if (email && !EMAIL_VALIDA.test(email)) {
    return { ok: false, errore: "Controlla l'indirizzo email." };
  }
  if (
    !Number.isInteger(persone) ||
    persone < ctx.cfg.minPersone ||
    persone > ctx.cfg.maxPersone
  ) {
    return {
      ok: false,
      errore: `Online si prenota da ${ctx.cfg.minPersone} a ${ctx.cfg.maxPersone} persone.`,
    };
  }

  const inizio = orarioValido(dati.giorno, dati.ora);
  if (!inizio) return { ok: false, errore: "Data e ora non valide." };
  if (!dentroFinestra(inizio, new Date(), ctx.cfg)) {
    return {
      ok: false,
      errore: `Online si prenota fino a ${ctx.cfg.giorniAvanti} giorni in anticipo.`,
    };
  }

  // L'ora scelta si riverifica adesso: quella proposta poteva essere libera
  // dieci minuti fa. `salvaPrenotazione` la ricontrolla ancora dentro la
  // transazione — questo passaggio serve a rispondere con un errore
  // comprensibile invece che con un rifiuto secco.
  const adesso = new Date();
  const [tavoli, occupate] = await Promise.all([
    tavoliPrenotabili(ctx.tenantId),
    occupazioniDelGiorno(ctx.tenantId, inizio, ctx.cfg),
  ]);
  const libere = disponibilita({
    orari: ctx.orari,
    tavoli,
    occupate,
    giorno: inizio,
    adesso,
    persone,
    cfg: ctx.cfg,
  });
  if (!libere.some((f) => f.ora === dati.ora)) {
    return {
      ok: false,
      errore: "Quell'orario non è più libero. Scegline un altro qui sopra.",
    };
  }

  if (troppeRichieste(await chiChiama(), LIMITE_PER_FINESTRA, FINESTRA_MS)) {
    return {
      ok: false,
      errore:
        "Hai già inviato diverse prenotazioni. Se serve cambiarne una, chiama il locale.",
    };
  }

  const esito = await salvaPrenotazione({
    tenantId: ctx.tenantId,
    inizio,
    persone,
    nome,
    telefono,
    email: email || null,
    note: note || null,
    source: "web",
    stato: ctx.cfg.confermaAutomatica ? "confirmed" : "pending",
    cfg: ctx.cfg,
    richiedeTavolo: true,
  });

  if (!esito.ok) return esito;

  // La mail parte adesso e dice due cose diverse a seconda di come lavora il
  // locale: "tavolo tuo" dove la conferma e' automatica, "l'abbiamo ricevuta"
  // dove risponde una persona. In tutti e due i casi porta il link.
  const mittente = await mittenteLocale(ctx.tenantId);
  const inviata = await avvisaCliente(
    ctx.cfg.confermaAutomatica ? "confermata" : "ricevuta",
    {
      nome,
      email: email || null,
      startsAt: inizio,
      partySize: persone,
      tableNumbers: esito.tavoli,
      token: esito.token,
    },
    mittente
  );
  if (inviata) {
    await db
      .update(reservations)
      .set({ notifiedAt: new Date() })
      .where(eq(reservations.token, esito.token));
  }

  revalidatePath("/dashboard/prenotazioni");
  return { ok: true, token: esito.token };
}

// Il cliente accetta lo spostamento proposto dal locale. Finche' non lo fa, la
// prenotazione resta scritta come "attende il cliente": in sala vale, ma
// nessuno puo' dire di aver avuto un si'.
export async function accettaSpostamento(
  formData: FormData
): Promise<void> {
  const ctx = await contestoPrenotazione();
  if (!ctx) return;
  const token = String(formData.get("token") ?? "");

  const [riga] = await db
    .select({ id: reservations.id, status: reservations.status })
    .from(reservations)
    .where(
      and(eq(reservations.token, token), eq(reservations.tenantId, ctx.tenantId))
    )
    .limit(1);
  if (!riga || riga.status !== "proposed") return;

  await db
    .update(reservations)
    .set({ status: "confirmed", previousStartsAt: null })
    .where(eq(reservations.id, riga.id));

  revalidatePath(`/prenota/${token}`);
  revalidatePath("/dashboard/prenotazioni");
}

// La stessa disdetta, dal modulo della pagina di riepilogo: li' non c'e'
// nessun client React che aspetti una risposta, c'e' un pulsante dentro un form.
export async function annullaDalModulo(formData: FormData): Promise<void> {
  await annullaDalCliente(String(formData.get("token") ?? ""));
}

// Disdetta dal link che il cliente si e' salvato. Un tavolo liberato con un
// tocco e' un tavolo che il locale puo' rivendere: rendere difficile disdire
// non fa venire nessuno, fa solo restare il posto vuoto.
export async function annullaDalCliente(
  token: string
): Promise<{ ok: boolean; errore?: string }> {
  const ctx = await contestoPrenotazione();
  if (!ctx) return { ok: false, errore: "Le prenotazioni non sono attive." };

  const [riga] = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.token, token),
        eq(reservations.tenantId, ctx.tenantId)
      )
    )
    .limit(1);
  if (!riga) return { ok: false, errore: "Prenotazione non trovata." };
  if (!["pending", "confirmed", "proposed"].includes(riga.status)) {
    return { ok: false, errore: "Questa prenotazione non è più modificabile." };
  }

  await db
    .update(reservations)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(reservations.id, riga.id));

  // Il locale lo scopre dalla sua casella, non aprendo il pannello: un tavolo
  // liberato la mattina si rivende solo se qualcuno lo viene a sapere.
  const dettaglio = riepilogoBreve({
    nome: riga.customerName,
    email: riga.customerEmail,
    startsAt: riga.startsAt,
    partySize: riga.partySize,
    tableNumbers: riga.tableNumbers,
    token: riga.token,
  });
  await avvisaLocale(
    await mittenteLocale(ctx.tenantId),
    riga.status === "proposed"
      ? `Spostamento rifiutato — ${dettaglio}`
      : `Prenotazione disdetta — ${dettaglio}`,
    [
      riga.status === "proposed"
        ? "Il cliente non ha accettato il nuovo orario e la prenotazione è stata annullata."
        : "Il cliente ha disdetto dalla pagina della sua prenotazione.",
      dettaglio,
      `Telefono: ${riga.customerPhone}`,
    ].join("\n\n")
  );

  revalidatePath(`/prenota/${token}`);
  revalidatePath("/dashboard/prenotazioni");
  return { ok: true };
}
