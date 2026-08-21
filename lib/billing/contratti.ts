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
  pack: string,
  model: ModelloContratto,
  period: Periodo,
  tenantId?: string
): Promise<{ recurringCents: number; activationCents: number }> {
  const p = await getPaccoPrezzato(pack, tenantId);
  // Pacchetto che non esiste (o su misura chiesto a un locale che non ce
  // l'ha): zero e non un prezzo a caso. Meglio una cifra vuota da correggere
  // che una plausibile e sbagliata.
  if (!p) return { recurringCents: 0, activationCents: 0 };
  if (model === "impianto") {
    return { recurringCents: p.assistenzaCents, activationCents: p.attivazioneCents };
  }
  return {
    recurringCents: period === "annuale" ? p.annualeCents : p.mensileCents,
    activationCents: 0,
  };
}

// Il cambio di piano che il locale ha chiesto e che aspetta il rinnovo.
//
// Scendere di piano non vale subito: ha gia' pagato fino a fine periodo, e
// togliergli i moduli prima sarebbe togliergli roba pagata. Sale invece
// subito — chi vuole un modulo oggi lo vuole oggi — e la differenza per i
// giorni che restano finisce in conguaglio sulla prossima fattura.
export async function programmaCambioPacco(
  tenantId: string,
  pack: string
): Promise<void> {
  const attuale = await getContratto(tenantId);
  if (!attuale) return;
  await db
    .update(tenantBilling)
    .set({
      pendingPack: pack,
      pendingFrom: attuale.nextInvoiceAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenantBilling.tenantId, tenantId));
}

export async function annullaCambioProgrammato(tenantId: string): Promise<void> {
  await db
    .update(tenantBilling)
    .set({ pendingPack: null, pendingFrom: null, updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, tenantId));
}

// Il cambio programmato scatta. Torna true se ha cambiato qualcosa.
//
// A scatenarlo e' il rinnovo, non l'orologio: si chiama da preparaRinnovi e
// da nessun altro posto. Guardare `pendingFrom` sembrava piu' prudente, ma
// quella data e' solo quello che ho detto al cliente — se la scadenza si
// sposta (una prova allungata, una correzione a mano) resta indietro, e il
// cambio non scatterebbe mai piu': il locale continuerebbe a pagare il piano
// vecchio aspettando un downgrade che non arriva.
export async function applicaCambioProgrammato(
  tenantId: string
): Promise<boolean> {
  const c = await getContratto(tenantId);
  if (!c?.pendingPack) return false;

  const nuovo = await canoneDaListino(
    c.pendingPack,
    c.model as ModelloContratto,
    c.period as Periodo,
    tenantId
  );

  await db
    .update(tenantBilling)
    .set({
      pack: c.pendingPack,
      recurringCents: nuovo.recurringCents,
      // Come nel cambio immediato: l'impianto segue il pacchetto solo se non
      // e' ancora stato fatturato. Chi l'ha gia' pagato non paga la differenza
      // — quel lavoro e' stato fatto una volta — ma chi non l'ha pagato si
      // vedra' fare l'impianto del pacchetto nuovo, e quello deve costare.
      activationCents: c.activationInvoicedAt
        ? c.activationCents
        : nuovo.activationCents,
      pendingPack: null,
      pendingFrom: null,
      updatedAt: new Date(),
    })
    .where(eq(tenantBilling.tenantId, tenantId));
  return true;
}

// Il conguaglio dell'upgrade a meta' periodo: la differenza di canone per i
// giorni che restano. Chi sale il primo giorno paga tutto, chi sale a due
// giorni dalla scadenza paga due giorni — che e' l'unico modo perche' salire
// non sembri una fregatura.
export async function segnaConguaglio(
  tenantId: string,
  cents: number,
  nota: string
): Promise<void> {
  if (!cents) return;
  const c = await getContratto(tenantId);
  if (!c) return;
  await db
    .update(tenantBilling)
    .set({
      adjustmentCents: c.adjustmentCents + Math.round(cents),
      adjustmentNote: nota,
      updatedAt: new Date(),
    })
    .where(eq(tenantBilling.tenantId, tenantId));
}

export async function azzeraConguaglio(tenantId: string): Promise<void> {
  await db
    .update(tenantBilling)
    .set({ adjustmentCents: 0, adjustmentNote: null, updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, tenantId));
}

// Quanto vale il resto del periodo, in millesimi di canone. Serve al
// conguaglio: se mancano 12 giorni su 30, la differenza si paga per 12/30.
export function quotaResidua(scadenza: Date, quando: Date, period: Periodo): number {
  const giorniPeriodo = period === "annuale" ? 365 : 30;
  const restano = Math.ceil((scadenza.getTime() - quando.getTime()) / 86400000);
  if (restano <= 0) return 0;
  return Math.min(1, restano / giorniPeriodo);
}

export type DatiContratto = {
  model: ModelloContratto;
  pack: string;
  period: Periodo;
  recurringCents: number;
  activationCents: number;
  transactionBps: number;
  status: StatoContratto;
  // Come paga lo decide il locale dalla sua dashboard, non io: e' il suo
  // conto corrente. Quando questo campo non arriva — ed e' il caso del
  // pannello admin — quello gia' scelto resta dov'e'.
  provider?: Provider;
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
  const attivo = dati.status === "attivo";
  const startedAt = attuale?.startedAt ?? (attivo ? new Date() : null);

  // Un contratto attivo deve sempre avere una scadenza. Attivo senza scadenza
  // vuol dire che non entra nel giro dei rinnovi, non produce mai una bozza e
  // non si fattura piu': il guasto peggiore possibile qui, perche' non fa
  // rumore e lo si scopre quando mancano i soldi. Percio' non basta metterla
  // al passaggio "prova -> attivo": se manca la si mette comunque.
  //
  // Quando invece la scadenza c'e' gia' non si tocca — riscriverla a ogni
  // salvataggio la sposterebbe in avanti ogni volta che si corregge una nota.
  const nextInvoiceAt =
    dati.status === "chiuso"
      ? null
      : attivo
        ? (attuale?.nextInvoiceAt ?? new Date())
        : (attuale?.nextInvoiceAt ?? null);

  // Un contratto attivo non ha una fine prova: la prova e' finita quando ha
  // firmato, ed e' `started_at` a dire da quando paga. Lasciarcela scritta
  // vuol dire tenere in giro un dato che racconta il passato come se valesse
  // ancora, e prima o poi qualcuno lo legge e ci crede — e' successo: davanti
  // a un attivo con la fine prova a settembre si conclude che fino a
  // settembre non paga, che e' il contrario di quello che dice il contratto.
  //
  // Si azzera solo passando ad attivo. Il sospeso se la tiene: e' quella che
  // dice se e' stato spento per una prova scaduta, e la guarda blocco.ts.
  const trialEndsAt = attivo ? null : (attuale?.trialEndsAt ?? null);

  const values = {
    ...dati,
    trialEndsAt,
    pack: isPaccoKey(dati.pack) ? dati.pack : "su_misura",
    provider: dati.provider ?? attuale?.provider ?? "manuale",
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

// L'attivazione risulta gia' chiesta, o torna da chiedere.
//
// Ad accenderla e' l'emissione di un documento che la contiene — e non la
// preparazione di una bozza, che si puo' cancellare — ma serve poterla
// correggere a mano: un impianto pagato a bonifico prima ancora di aprire una
// fattura va segnato, e un flag acceso per sbaglio va spento, altrimenti
// quell'attivazione non la chiede piu' nessuno e sparisce per sempre.
export async function segnaAttivazioneFatturata(tenantId: string): Promise<void> {
  await db
    .update(tenantBilling)
    .set({ activationInvoicedAt: new Date(), updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, tenantId));
}

export async function rimettiAttivazioneDaFatturare(tenantId: string): Promise<void> {
  await db
    .update(tenantBilling)
    .set({ activationInvoicedAt: null, updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, tenantId));
}

// Il locale ha messo la carta: si annota chi e' di la'.
//
// Non tocca lo stato del contratto, ed e' voluto. Chi e' in prova e mette la
// carta resta in prova fino a quando la prova finisce — la carta e' una
// promessa di pagare, non un pagamento — e ad attivarlo sara' il primo
// incasso vero. Il contrario vorrebbe dire un locale "attivo" che non ha
// ancora versato un euro, e non e' quello che si va a leggere nel pannello
// quando si chiede chi paga.
export async function agganciaProvider(
  tenantId: string,
  dati: { provider: Provider; customerId?: string | null; subscriptionId?: string | null }
): Promise<void> {
  await db
    .update(tenantBilling)
    .set({
      provider: dati.provider,
      // `undefined` lascia la colonna dov'e', `null` la svuota: servono
      // tutti e due, perche' una disdetta stacca l'abbonamento ma il cliente
      // di la' resta — e' lo stesso a cui si rivende domani.
      ...(dati.customerId !== undefined ? { providerCustomerId: dati.customerId } : {}),
      ...(dati.subscriptionId !== undefined
        ? { providerSubscriptionId: dati.subscriptionId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(tenantBilling.tenantId, tenantId));
}

// Il primo incasso e' arrivato: il contratto parte davvero.
//
// Si chiama dall'incasso e non dalla firma perche' e' li' che il rapporto
// comincia a valere. Le date non si riscrivono se ci sono gia': un rinnovo
// incassato a marzo non deve spostare a marzo l'inizio di un rapporto nato a
// gennaio, o il conto degli anni non torna piu'.
export async function attivaDaIncasso(
  tenantId: string,
  scadenza: Date
): Promise<void> {
  const c = await getContratto(tenantId);
  if (!c || c.status === "chiuso") return;
  await db
    .update(tenantBilling)
    .set({
      status: "attivo",
      startedAt: c.startedAt ?? new Date(),
      trialEndsAt: null,
      nextInvoiceAt: scadenza,
      endedAt: null,
      updatedAt: new Date(),
    })
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
