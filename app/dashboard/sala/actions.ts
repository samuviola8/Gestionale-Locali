"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { getTenantModules } from "@/lib/modules";
import { loadOpenTables } from "@/lib/bill-query";
import {
  aggiornaPersone,
  apriSeduta,
  chiudiSeduta,
  sedutaDi,
  seduteAperte,
  spostaTavolo,
} from "@/lib/sedute";
import { revokeTableSessions } from "@/lib/table-session";

// Quello che si fa dalla pianta della sala: accostare due tavoli, separarli,
// segnare che a un tavolo si e' seduto qualcuno e liberarlo quando se ne va
// senza aver consumato niente.
//
// Nessuna di queste azioni cambia pagina: si resta sulla sala, che e' quello
// che si sta guardando, e il riquadro si aggiorna da solo.

export type Esito = { ok: true } | { ok: false; errore: string };

const NON_AUTORIZZATO: Esito = {
  ok: false,
  errore: "Sessione scaduta. Rientra.",
};

async function contesto(): Promise<{ tenantId: string } | null> {
  const s = await getSessionUser();
  if (!s) return null;

  // La sala ha senso dove ci sono tavoli da gestire: col QR o con le
  // prenotazioni. Il controllo non rimanda da nessuna parte — un'azione che
  // risponde con un redirect fa rimbalzare al login chi la sta usando.
  const modules = await getTenantModules(s.tenantId);
  if (!modules.qr_ordering && !modules.reservations) return null;

  return { tenantId: s.tenantId };
}

function aggiorna(): void {
  revalidatePath("/dashboard/sala");
  revalidatePath("/dashboard/bill");
  revalidatePath("/dashboard/cameriere");
  revalidatePath("/dashboard");
}

function leggiPersone(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}

// Accosta due o piu' tavoli: da qui in poi sono un tavolo solo, occupati tutti
// e con un conto solo.
export async function unisciTavoli(
  numeri: number[],
  persone?: number | null
): Promise<Esito> {
  const ctx = await contesto();
  if (!ctx) return NON_AUTORIZZATO;

  const scelti = Array.isArray(numeri) ? numeri.map(Number) : [];
  if (scelti.length < 2) {
    return { ok: false, errore: "Scegli almeno due tavoli da unire." };
  }

  const esito = await apriSeduta(ctx.tenantId, scelti, {
    persone: leggiPersone(persone),
  });
  if (!esito.ok) return esito;

  aggiorna();
  return { ok: true };
}

// «Qui c'e' gente»: il tavolo risulta occupato prima ancora che ordinino.
// Serve a chi tiene la sala a mente e non vuole scoprire alle nove che il
// tavolo che dava per libero era pieno da mezz'ora.
export async function apriTavolo(
  tavolo: number,
  persone?: number | null
): Promise<Esito> {
  const ctx = await contesto();
  if (!ctx) return NON_AUTORIZZATO;

  const esito = await apriSeduta(ctx.tenantId, [Number(tavolo)], {
    persone: leggiPersone(persone),
  });
  if (!esito.ok) return esito;

  aggiorna();
  return { ok: true };
}

// Porta il gruppo, con il suo conto, su un altro tavolo. Serve piu' spesso a
// correggere che a spostare: il conto aperto sul tavolo sbagliato e' l'errore
// di tutte le sere, e fino a ieri si rimediava solo annullando le righe.
export async function spostaConto(da: number, a: number[]): Promise<Esito> {
  const ctx = await contesto();
  if (!ctx) return NON_AUTORIZZATO;

  const partenza =
    sedutaDi(await seduteAperte(ctx.tenantId), Number(da))?.tavoli ?? [
      Number(da),
    ];

  const arrivo = (Array.isArray(a) ? a : [a]).map(Number);
  const esito = await spostaTavolo(ctx.tenantId, Number(da), arrivo);
  if (!esito.ok) return esito;

  // I telefoni rimasti ai tavoli di prima non devono poter continuare a
  // ordinare su un conto che adesso e' da un'altra parte: si riscansiona.
  for (const n of partenza.filter((t) => !arrivo.includes(t))) {
    await revokeTableSessions(ctx.tenantId, n);
  }

  aggiorna();
  return { ok: true };
}

// Stacca i tavoli. Quello che era gia' stato ordinato resta sul conto del
// capofila: le comande sono partite e nessuno sa piu' chi ha mangiato da che
// parte del tavolo lungo.
export async function separaTavoli(tavolo: number): Promise<Esito> {
  const ctx = await contesto();
  if (!ctx) return NON_AUTORIZZATO;

  const seduta = sedutaDi(await seduteAperte(ctx.tenantId), Number(tavolo));
  if (!seduta) return { ok: false, errore: "Questo tavolo non e' unito a nessuno." };

  await chiudiSeduta(ctx.tenantId, Number(tavolo));
  aggiorna();
  return { ok: true };
}

// Il tavolo torna libero. Si puo' solo se non c'e' niente da incassare: un
// conto aperto si chiude dalla cassa, dove si vede quanto e da chi.
export async function liberaTavolo(tavolo: number): Promise<Esito> {
  const ctx = await contesto();
  if (!ctx) return NON_AUTORIZZATO;

  const n = Number(tavolo);
  const seduta = sedutaDi(await seduteAperte(ctx.tenantId), n);
  const tavoli = seduta?.tavoli ?? [n];

  const conto = (await loadOpenTables(ctx.tenantId, n))[0];
  if (conto) {
    return {
      ok: false,
      errore: "C'e' un conto aperto: chiudilo da «Conti aperti».",
    };
  }

  if (seduta) await chiudiSeduta(ctx.tenantId, n);

  // Chi aveva scansionato il QR perde l'accesso: senza, il tavolo tornerebbe
  // occupato al primo caricamento della pagina del cliente.
  for (const t of tavoli) {
    await revokeTableSessions(ctx.tenantId, t);
  }

  aggiorna();
  return { ok: true };
}

// Quante persone si sono sedute. Prima della prima consumazione e' l'unico
// posto dove il numero puo' esistere; dopo, il coperto lo prende dal conto e
// si corregge da li'.
export async function segnaPersone(
  tavolo: number,
  persone: number
): Promise<Esito> {
  const ctx = await contesto();
  if (!ctx) return NON_AUTORIZZATO;

  await aggiornaPersone(ctx.tenantId, Number(tavolo), leggiPersone(persone));
  aggiorna();
  return { ok: true };
}
