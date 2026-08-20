import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantAddons, tenantBilling, tenants } from "@/lib/db/schema";
import { isPaccoKey, type PaccoKey } from "@/lib/billing/listino";
import { getPaccoPrezzato } from "@/lib/billing/prezzi";
import { getImpostazioni } from "@/lib/billing/impostazioni";

// Il contratto del locale: leggerlo, scriverlo, sapere quando scade.
// I documenti stanno in lib/billing/documenti.ts — qui dentro non si emette
// niente, si decide solo cosa e quando.

export type ModelloContratto = "abbonamento" | "impianto";
export type Periodo = "mensile" | "annuale";
export type StatoContratto = "prova" | "attivo" | "sospeso" | "chiuso";
export type Provider = "stripe" | "paypal" | "manuale";

export type Contratto = typeof tenantBilling.$inferSelect;

export function isModello(v: string): v is ModelloContratto {
  return v === "abbonamento" || v === "impianto";
}

export function isPeriodo(v: string): v is Periodo {
  return v === "mensile" || v === "annuale";
}

export function isStato(v: string): v is StatoContratto {
  return ["prova", "attivo", "sospeso", "chiuso"].includes(v);
}

export function isProvider(v: string): v is Provider {
  return v === "stripe" || v === "paypal" || v === "manuale";
}

export async function getContratto(tenantId: string): Promise<Contratto | null> {
  const rows = await db
    .select()
    .from(tenantBilling)
    .where(eq(tenantBilling.tenantId, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

export type ContrattoConLocale = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  legalName: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  vatNumber: string | null;
  sdiCode: string | null;
  pecEmail: string | null;
  serviceBlocked: boolean;
  blockedReason: string | null;
  contratto: Contratto | null;
  /** Somma degli add-on al mese. Da sommare al canone, mai da mostrare solo. */
  addonsCents: number;
};

// Si parte dai locali e non dai contratti: un locale senza contratto e'
// esattamente quello che voglio vedere nel pannello — e' uno a cui non ho
// ancora chiesto di pagare.
//
// Gli add-on arrivano insieme perche' senza di loro il canone mostrato non e'
// quello che il locale paga: `recurringCents` e' la sola parte di pacchetto.
export async function getContratti(): Promise<ContrattoConLocale[]> {
  // La somma si fa qui e non chiamando lib/billing/addons.ts: quello importa
  // gia' questo file per sapere che pacchetto ha firmato il locale, e farsi
  // importare a sua volta sarebbe un giro chiuso per una somma di due colonne.
  const righeAddon = await db
    .select({
      tenantId: tenantAddons.tenantId,
      totale: sql<number>`coalesce(sum(${tenantAddons.priceCents}), 0)::int`,
    })
    .from(tenantAddons)
    .groupBy(tenantAddons.tenantId);
  const addons = new Map(righeAddon.map((r) => [r.tenantId, r.totale]));

  const rows = await db
    .select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantSlug: tenants.slug,
      legalName: tenants.legalName,
      address: tenants.address,
      postalCode: tenants.postalCode,
      city: tenants.city,
      province: tenants.province,
      vatNumber: tenants.vatNumber,
      sdiCode: tenants.sdiCode,
      pecEmail: tenants.pecEmail,
      serviceBlocked: tenants.serviceBlocked,
      blockedReason: tenants.blockedReason,
      contratto: tenantBilling,
    })
    .from(tenants)
    .leftJoin(tenantBilling, eq(tenantBilling.tenantId, tenants.id))
    .orderBy(asc(tenants.name));
  return rows.map((r) => ({ ...r, addonsCents: addons.get(r.tenantId) ?? 0 }));
}

// La prova parte alla creazione del locale. Nessun importo, nessuna scadenza
// da fatturare: solo la data entro cui va richiamato per chiedergli se resta.
// Senza un numero esplicito vale la durata scelta nelle impostazioni.
export async function avviaProva(
  tenantId: string,
  giorni?: number
): Promise<void> {
  const durata = giorni ?? (await getImpostazioni()).trialDays;
  await db
    .insert(tenantBilling)
    .values({
      tenantId,
      status: "prova",
      trialEndsAt: fraGiorni(durata),
    })
    .onConflictDoNothing();
}

// Rimettere un locale in prova, o allungargliela. Si allunga da oggi e non
// dalla scadenza vecchia: se la prova e' finita tre settimane fa, "altri
// quindici giorni" vuol dire quindici giorni da adesso, non meno dodici.
export async function impostaProva(
  tenantId: string,
  giorni: number
): Promise<void> {
  const values = {
    status: "prova",
    trialEndsAt: fraGiorni(Math.max(1, Math.round(giorni))),
    nextInvoiceAt: null,
    endedAt: null,
    updatedAt: new Date(),
  };
  await db
    .insert(tenantBilling)
    .values({ tenantId, ...values })
    .onConflictDoUpdate({ target: tenantBilling.tenantId, set: values });
}

// Il canone che il listino chiede oggi per un pacchetto. Serve a proporre la
// cifra nel pannello: quella che conta, dopo, e' quella scritta nel contratto.
export async function canoneDaListino(
  pack: PaccoKey,
  model: ModelloContratto,
  period: Periodo
): Promise<{ recurringCents: number; activationCents: number }> {
  const p = await getPaccoPrezzato(pack);
  if (model === "impianto") {
    return { recurringCents: p.assistenzaCents, activationCents: p.attivazioneCents };
  }
  return {
    recurringCents: period === "annuale" ? p.annualeCents : p.mensileCents,
    activationCents: 0,
  };
}

export type DatiContratto = {
  model: ModelloContratto;
  pack: string;
  period: Periodo;
  recurringCents: number;
  activationCents: number;
  transactionBps: number;
  status: StatoContratto;
  provider: Provider;
  notes: string | null;
};

export async function salvaContratto(
  tenantId: string,
  dati: DatiContratto
): Promise<void> {
  const attuale = await getContratto(tenantId);

  // Passare da "prova" ad "attivo" e' il momento della firma: e' li' che
  // partono l'inizio del rapporto e la prima scadenza da fatturare. Se il
  // contratto era gia' attivo la data di rinnovo non si tocca — riscriverla a
  // ogni salvataggio del pannello sposterebbe in avanti la fattura ogni volta
  // che si corregge una nota.
  const diventaAttivo = dati.status === "attivo" && attuale?.status !== "attivo";
  const startedAt = attuale?.startedAt ?? (diventaAttivo ? new Date() : null);
  const nextInvoiceAt = diventaAttivo
    ? new Date()
    : dati.status === "chiuso"
      ? null
      : (attuale?.nextInvoiceAt ?? null);

  const values = {
    ...dati,
    pack: isPaccoKey(dati.pack) ? dati.pack : "su_misura",
    startedAt,
    nextInvoiceAt,
    endedAt: dati.status === "chiuso" ? (attuale?.endedAt ?? new Date()) : null,
    updatedAt: new Date(),
  };

  await db
    .insert(tenantBilling)
    .values({ tenantId, ...values })
    .onConflictDoUpdate({ target: tenantBilling.tenantId, set: values });
}

export async function segnaProssimaScadenza(
  tenantId: string,
  data: Date | null
): Promise<void> {
  await db
    .update(tenantBilling)
    .set({ nextInvoiceAt: data, updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, tenantId));
}

export async function segnaAttivazioneFatturata(tenantId: string): Promise<void> {
  await db
    .update(tenantBilling)
    .set({ activationInvoicedAt: new Date(), updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, tenantId));
}

// La scadenza dopo questa. Sul mensile si somma un mese vero, non trenta
// giorni: chi firma il 31 gennaio si aspetta di pagare a fine febbraio, non
// il 2 marzo. Quando il giorno non esiste nel mese nuovo si arretra alla fine
// del mese, che e' quello che fanno anche le banche.
export function prossimaScadenza(period: Periodo, da: Date): Date {
  const d = new Date(da);
  const giorno = d.getDate();
  if (period === "annuale") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
    if (d.getDate() !== giorno) d.setDate(0);
  }
  return d;
}

function fraGiorni(giorni: number): Date {
  return new Date(Date.now() + giorni * 24 * 60 * 60 * 1000);
}

// Quante mensilita' copre una scadenza. Gli add-on hanno un prezzo al mese:
// su un abbonamento annuale ne entrano dodici in fattura, sul resto uno.
//
// Sta qui e non dentro chi prepara le fatture perche' lo stesso numero serve
// anche a chi mostra il totale: se i due si scrivessero il conto per conto
// proprio, prima o poi il pannello direbbe una cifra e la fattura un'altra.
export function mesiPerScadenza(c: {
  model: string;
  period: string;
}): number {
  return c.model === "abbonamento" && c.period === "annuale" ? 12 : 1;
}

// Quanto arriva davvero in fattura a ogni scadenza: il canone piu' gli add-on.
// `recurringCents` da solo non e' il prezzo del locale — e' solo la sua parte
// di pacchetto — e mostrarlo come totale vuol dire far litigare il pannello
// con la fattura che arriva dopo.
export function importoAScadenzaCents(
  c: Contratto,
  addonsMensiliCents = 0
): number {
  return c.recurringCents + addonsMensiliCents * mesiPerScadenza(c);
}

// Lo stesso importo riportato al mese, per sommare mele con mele nel pannello:
// un annuale da 490 pesa 40,83 al mese, non 490.
export function canoneMensileCents(
  c: Contratto,
  addonsMensiliCents = 0
): number {
  if (c.status !== "attivo") return 0;
  const base =
    c.model === "abbonamento" && c.period === "annuale"
      ? Math.round(c.recurringCents / 12)
      : c.recurringCents;
  return base + addonsMensiliCents;
}

export function etichettaPeriodo(c: Contratto): string {
  if (c.model === "impianto") return "al mese, assistenza";
  return c.period === "annuale" ? "all'anno" : "al mese";
}
