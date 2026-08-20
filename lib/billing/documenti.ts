import { and, asc, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  invoiceLines,
  invoices,
  payments,
  tenantBilling,
  tenants,
} from "@/lib/db/schema";
import {
  aliquotaBps,
  bolloDovutoCents,
  getEmittente,
  mancanzeEmittente,
  notaIva,
  type Emittente,
} from "@/lib/billing/emittente";
import {
  mesiPerScadenza,
  prossimaScadenza,
  segnaAttivazioneFatturata,
  type Periodo,
} from "@/lib/billing/contratti";
import { getAddons, totaleAddonsCents } from "@/lib/billing/addons";
import { aggiornaBloccoLocale } from "@/lib/billing/blocco";

// I documenti verso i locali: si creano in bozza, si emettono, si incassano.
//
// La bozza e' modificabile e non ha numero. L'emissione e' il punto di non
// ritorno: assegna il progressivo, congela emittente e destinatario, e da li'
// in poi si corregge solo con una nota di credito. Non e' pignoleria mia, e'
// come funziona un registro delle fatture.

export type Documento = typeof invoices.$inferSelect;
export type RigaDocumento = typeof invoiceLines.$inferSelect;
export type Incasso = typeof payments.$inferSelect;

export type TipoDocumento = "proforma" | "fattura" | "nota_credito";
export type StatoDocumento = "bozza" | "emesso" | "pagato" | "scaduto" | "annullato";
export type MetodoIncasso = "stripe" | "paypal" | "bonifico" | "contanti" | "altro";

export type RigaNuova = {
  kind: string;
  description: string;
  quantity?: number;
  unitCents: number;
};

export function isMetodo(v: string): v is MetodoIncasso {
  return ["stripe", "paypal", "bonifico", "contanti", "altro"].includes(v);
}

// Il numero da mostrare. Una bozza non ce l'ha ancora, e scriverci "2026/—"
// e' piu' onesto che inventarne uno che poi cambia.
export function numeroDocumento(d: Documento): string {
  return d.number ? `${d.year}/${d.number}` : `${d.year}/—`;
}

// Quello che serve per intestare una fattura a un locale. Vuoto = si puo'
// emettere.
//
// Non e' pignoleria: senza partita IVA e sede quella non e' una fattura, e
// scoprirlo il primo del mese mentre si fattura a venti locali insieme e'
// tardi. Il pannello lo dice prima, sulla scheda del locale.
export type Intestatario = {
  legalName: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  vatNumber: string | null;
  sdiCode: string | null;
  pecEmail: string | null;
};

export function mancanzeIntestatario(l: Intestatario): string[] {
  const mancano: string[] = [];
  if (!l.legalName?.trim()) mancano.push("ragione sociale");
  if (!l.vatNumber?.trim()) mancano.push("partita IVA");
  if (!l.address?.trim() || !l.postalCode?.trim() || !l.city?.trim()) {
    mancano.push("sede");
  }
  if (!l.province?.trim()) mancano.push("provincia");
  return mancano;
}

// Manca ma non ferma niente: senza uno dei due la fattura si emette e si
// consegna a mano, ma allo SDI non partira'. Meglio saperlo adesso che il
// giorno in cui si collega il provider e si scopre che a meta' dei locali non
// li ho mai chiesti.
export function avvisiIntestatario(l: Intestatario): string[] {
  if (!l.sdiCode?.trim() && !l.pecEmail?.trim()) {
    return ["codice destinatario o PEC (serviranno allo SDI)"];
  }
  return [];
}

export function calcolaTotali(
  righe: RigaNuova[],
  e: Emittente = getEmittente()
): {
  subtotalCents: number;
  vatRateBps: number;
  vatCents: number;
  stampCents: number;
  totalCents: number;
} {
  const subtotalCents = righe.reduce(
    (s, r) => s + Math.round(r.unitCents * (r.quantity ?? 1)),
    0
  );
  const vatRateBps = aliquotaBps(e);
  const vatCents = Math.round((subtotalCents * vatRateBps) / 10000);
  const stampCents = bolloDovutoCents(subtotalCents, vatCents);
  return {
    subtotalCents,
    vatRateBps,
    vatCents,
    stampCents,
    totalCents: subtotalCents + vatCents + stampCents,
  };
}

export async function creaDocumento(
  tenantId: string,
  dati: {
    kind?: TipoDocumento;
    righe: RigaNuova[];
    periodStart?: Date | null;
    periodEnd?: Date | null;
    notes?: string | null;
  }
): Promise<string> {
  const righe = dati.righe.filter((r) => r.description.trim());
  if (!righe.length) throw new Error("Un documento senza righe non esiste.");

  const totali = calcolaTotali(righe);
  const anno = new Date().getFullYear();

  const [doc] = await db
    .insert(invoices)
    .values({
      tenantId,
      year: anno,
      kind: dati.kind ?? "fattura",
      status: "bozza",
      periodStart: dati.periodStart ?? null,
      periodEnd: dati.periodEnd ?? null,
      notes: dati.notes ?? null,
      ...totali,
    })
    .returning({ id: invoices.id });

  await db.insert(invoiceLines).values(
    righe.map((r, i) => ({
      invoiceId: doc.id,
      kind: r.kind,
      description: r.description.trim(),
      quantity: r.quantity ?? 1,
      unitCents: r.unitCents,
      totalCents: Math.round(r.unitCents * (r.quantity ?? 1)),
      position: i,
    }))
  );

  return doc.id;
}

// L'emissione. Il progressivo si legge e si scrive nella stessa transazione:
// due emissioni contemporanee darebbero altrimenti lo stesso numero, e una
// serie con un doppione e' un problema che si scopre a marzo dell'anno dopo.
export async function emettiDocumento(id: string): Promise<void> {
  const e = getEmittente();
  const mancano = mancanzeEmittente(e);
  if (mancano.length) {
    throw new Error(
      `Non si emette senza ${mancano.join(", ")}: completa i dati in FATTURAZIONE_* prima.`
    );
  }

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);
    const doc = rows[0];
    if (!doc) throw new Error("Documento non trovato.");
    if (doc.status !== "bozza") return;

    const locali = await tx
      .select()
      .from(tenants)
      .where(eq(tenants.id, doc.tenantId))
      .limit(1);
    const locale = locali[0];
    if (!locale) throw new Error("Locale non trovato.");

    // I dati del locale si controllano qui e non solo nel pannello: una
    // fattura senza partita IVA non deve poter esistere nemmeno se qualcuno
    // arriva all'emissione per un'altra strada.
    const suoi = mancanzeIntestatario(locale);
    if (suoi.length) {
      throw new Error(
        `A ${locale.name} manca ${suoi.join(", ")}: completa i dati per la fattura sulla sua scheda.`
      );
    }

    const ultimo = await tx
      .select({ max: sql<number | null>`max(${invoices.number})` })
      .from(invoices)
      .where(eq(invoices.year, doc.year));
    const numero = (ultimo[0]?.max ?? 0) + 1;

    const ora = new Date();
    const scadenza = new Date(ora);
    scadenza.setDate(scadenza.getDate() + e.giorniScadenza);

    await tx
      .update(invoices)
      .set({
        number: numero,
        status: "emesso",
        issuedAt: ora,
        dueAt: scadenza,
        vatNote: notaIva(e),
        sdiStatus: doc.kind === "proforma" ? null : "da_inviare",
        sellerSnapshot: {
          ragioneSociale: e.ragioneSociale,
          partitaIva: e.partitaIva,
          codiceFiscale: e.codiceFiscale,
          indirizzo: e.indirizzo,
          cap: e.cap,
          citta: e.citta,
          provincia: e.provincia,
          email: e.email,
          iban: e.iban,
          regime: e.regime,
        },
        buyerSnapshot: {
          nome: locale.legalName || locale.name,
          partitaIva: locale.vatNumber,
          codiceFiscale: locale.taxCode,
          indirizzo: locale.address,
          cap: locale.postalCode,
          citta: locale.city,
          provincia: locale.province,
          sdiCode: locale.sdiCode,
          pec: locale.pecEmail,
          email: locale.billingEmail || locale.contactEmail,
        },
        updatedAt: ora,
      })
      .where(eq(invoices.id, id));
  });
}

// Un incasso arrivato. Il documento passa a "pagato" solo quando la somma
// degli incassi copre il totale: un acconto lo lascia aperto, ed e' giusto
// cosi' — l'impianto si paga spesso in due volte.
export async function registraIncasso(dati: {
  tenantId: string;
  invoiceId: string | null;
  amountCents: number;
  method: MetodoIncasso;
  providerRef?: string | null;
  paidAt?: Date;
  notes?: string | null;
}): Promise<void> {
  if (dati.amountCents <= 0) return;

  await db.insert(payments).values({
    tenantId: dati.tenantId,
    invoiceId: dati.invoiceId,
    amountCents: dati.amountCents,
    method: dati.method,
    providerRef: dati.providerRef || null,
    paidAt: dati.paidAt ?? new Date(),
    notes: dati.notes ?? null,
  });

  if (dati.invoiceId) await aggiornaStatoIncasso(dati.invoiceId);
}

export async function aggiornaStatoIncasso(invoiceId: string): Promise<void> {
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  const doc = rows[0];
  if (!doc || doc.status === "annullato") return;

  const incassato = await sommaIncassi(invoiceId);
  if (incassato >= doc.totalCents) {
    const ultimo = await db
      .select({ paidAt: payments.paidAt })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(desc(payments.paidAt))
      .limit(1);
    await db
      .update(invoices)
      .set({ status: "pagato", paidAt: ultimo[0]?.paidAt ?? new Date(), updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
    // Saldato l'arretrato, il servizio riparte da solo: chi ha pagato non
    // deve aspettare che me ne accorga io.
    await aggiornaBloccoLocale(doc.tenantId);
  } else if (doc.status === "pagato") {
    // Un incasso stornato riapre il documento invece di lasciarlo verde.
    await db
      .update(invoices)
      .set({ status: "emesso", paidAt: null, updatedAt: new Date() })
      .where(eq(invoices.id, invoiceId));
  }
}

export async function sommaIncassi(invoiceId: string): Promise<number> {
  const rows = await db
    .select({ tot: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(eq(payments.invoiceId, invoiceId));
  return rows[0]?.tot ?? 0;
}

export async function annullaDocumento(id: string): Promise<void> {
  await db
    .update(invoices)
    .set({ status: "annullato", updatedAt: new Date() })
    .where(eq(invoices.id, id));
}

export async function eliminaBozza(id: string): Promise<void> {
  // Solo le bozze: un documento emesso si annulla, non si cancella.
  await db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.status, "bozza")));
}

export async function documentiDelLocale(tenantId: string): Promise<Documento[]> {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.tenantId, tenantId))
    .orderBy(desc(invoices.createdAt));
}

export async function documentoCompleto(id: string): Promise<
  | {
      documento: Documento;
      righe: RigaDocumento[];
      incassi: Incasso[];
      locale: typeof tenants.$inferSelect;
      incassato: number;
    }
  | null
> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  const documento = rows[0];
  if (!documento) return null;

  const [righe, incassi, locali] = await Promise.all([
    db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, id))
      .orderBy(asc(invoiceLines.position)),
    db
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, id))
      .orderBy(desc(payments.paidAt)),
    db.select().from(tenants).where(eq(tenants.id, documento.tenantId)).limit(1),
  ]);

  return {
    documento,
    righe,
    incassi,
    locale: locali[0],
    incassato: incassi.reduce((s, i) => s + i.amountCents, 0),
  };
}

export type DocumentoConLocale = Documento & { tenantName: string };

export async function ultimiDocumenti(limite = 50): Promise<DocumentoConLocale[]> {
  const rows = await db
    .select({ documento: invoices, tenantName: tenants.name })
    .from(invoices)
    .innerJoin(tenants, eq(tenants.id, invoices.tenantId))
    .orderBy(desc(invoices.createdAt))
    .limit(limite);
  return rows.map((r) => ({ ...r.documento, tenantName: r.tenantName }));
}

// Chi ha una scadenza arrivata e va fatturato. E' la lista su cui si preme
// "genera": finche' non la si preme non succede niente, perche' emettere una
// fattura di nascosto mentre nessuno guarda e' il modo migliore per
// accorgersene quando e' gia' partita al cliente sbagliato.
export async function contrattiDaFatturare(quando: Date = new Date()) {
  const righe = await db
    .select({
      tenantId: tenantBilling.tenantId,
      tenantName: tenants.name,
      model: tenantBilling.model,
      pack: tenantBilling.pack,
      period: tenantBilling.period,
      recurringCents: tenantBilling.recurringCents,
      activationCents: tenantBilling.activationCents,
      activationInvoicedAt: tenantBilling.activationInvoicedAt,
      nextInvoiceAt: tenantBilling.nextInvoiceAt,
    })
    .from(tenantBilling)
    .innerJoin(tenants, eq(tenants.id, tenantBilling.tenantId))
    .where(
      and(
        eq(tenantBilling.status, "attivo"),
        isNotNull(tenantBilling.nextInvoiceAt),
        lte(tenantBilling.nextInvoiceAt, quando)
      )
    )
    .orderBy(asc(tenantBilling.nextInvoiceAt));

  // Gli add-on entrano in fattura come il canone, quindi devono comparire
  // anche nell'anteprima: vedere "39,00" e ricevere una bozza da 59 e' il
  // genere di sorpresa che fa ricontrollare tutto a mano ogni volta.
  return Promise.all(
    righe.map(async (c) => {
      const addons = await totaleAddonsCents(c.tenantId);
      return {
        ...c,
        addonsCents: addons,
        totaleCents:
          c.recurringCents +
          addons * mesiPerScadenza(c) +
          (c.activationInvoicedAt ? 0 : c.activationCents),
      };
    })
  );
}

// Prepara le bozze del giro. Non emette: le bozze si guardano, si correggono
// e si emettono a mano. Con venti locali e' un minuto, e vale il minuto.
export async function preparaRinnovi(quando: Date = new Date()): Promise<number> {
  const scaduti = await contrattiDaFatturare(quando);
  let fatti = 0;

  for (const c of scaduti) {
    const inizio = c.nextInvoiceAt ?? quando;
    const fine = prossimaScadenza(c.period as Periodo, inizio);
    const righe: RigaNuova[] = [];

    // L'attivazione entra nella prima fattura e in nessun'altra.
    if (c.activationCents > 0 && !c.activationInvoicedAt) {
      righe.push({
        kind: "attivazione",
        description: "Attivazione e impianto Comanda",
        unitCents: c.activationCents,
      });
    }

    if (c.recurringCents > 0) {
      righe.push({
        kind: "canone",
        description:
          c.model === "impianto"
            ? `Assistenza e servizio Comanda — ${periodoLeggibile(inizio, fine)}`
            : `Abbonamento Comanda ${c.pack} — ${periodoLeggibile(inizio, fine)}`,
        unitCents: c.recurringCents,
      });
    }

    // Gli add-on concordati col locale, una riga per uno: sul conto deve
    // vedersi cosa sta pagando, non un totale che non sa spiegare.
    // Sull'annuale valgono dodici mesi, come il canone accanto.
    const mesi = mesiPerScadenza(c);
    for (const a of await getAddons(c.tenantId)) {
      if (a.priceCents <= 0) continue;
      righe.push({
        kind: "modulo",
        description: a.label,
        quantity: mesi,
        unitCents: a.priceCents,
      });
    }

    if (!righe.length) continue;

    await creaDocumento(c.tenantId, {
      righe,
      periodStart: inizio,
      periodEnd: fine,
    });

    if (c.activationCents > 0 && !c.activationInvoicedAt) {
      await segnaAttivazioneFatturata(c.tenantId);
    }

    await db
      .update(tenantBilling)
      .set({ nextInvoiceAt: fine, updatedAt: new Date() })
      .where(eq(tenantBilling.tenantId, c.tenantId));

    fatti++;
  }

  return fatti;
}

// I documenti emessi con la scadenza passata. Girarli a "scaduto" e' quello
// che accende il rosso nel pannello.
export async function segnaScaduti(quando: Date = new Date()): Promise<number> {
  const rows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.status, "emesso"), isNotNull(invoices.dueAt), lte(invoices.dueAt, quando)));
  if (!rows.length) return 0;
  await db
    .update(invoices)
    .set({ status: "scaduto", updatedAt: new Date() })
    .where(inArray(invoices.id, rows.map((r) => r.id)));
  return rows.length;
}

function periodoLeggibile(da: Date, a: Date): string {
  const f = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });
  return `dal ${f.format(da)} al ${f.format(a)}`;
}
