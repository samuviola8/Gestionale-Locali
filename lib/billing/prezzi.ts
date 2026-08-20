import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingPrices } from "@/lib/db/schema";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import {
  PACCHETTI,
  PREZZI_MODULI,
  getPacco,
  isPaccoKey,
  type Pacco,
  type PaccoKey,
} from "@/lib/billing/listino";
import { getSuMisura } from "@/lib/billing/sumisura";

// Il prezzo che vale, risolto su tre livelli e sempre nello stesso ordine:
//
//   1. il catalogo nel codice (lib/billing/listino.ts)  — il ripiego
//   2. il listino, modificato dal pannello               — vale per tutti
//   3. il prezzo di quel locale                          — vince su tutto
//
// L'ordine sta scritto qui e in nessun altro posto. Se la risoluzione si
// sparpaglia fra le pagine, fra sei mesi davanti a un importo sbagliato non si
// sa piu' quale dei tre livelli l'ha deciso.

export type PrezzoPacco = {
  mensileCents: number;
  annualeCents: number;
  attivazioneCents: number;
  assistenzaCents: number;
};

// Le righe che riguardano questo locale: le globali piu' le sue. Arrivano
// insieme perche' vanno confrontate, e due query separate vorrebbero dire due
// momenti diversi.
async function righe(scope: "pacco" | "modulo", tenantId?: string) {
  return db
    .select()
    .from(billingPrices)
    .where(
      and(
        eq(billingPrices.scope, scope),
        tenantId
          ? or(isNull(billingPrices.tenantId), eq(billingPrices.tenantId, tenantId))
          : isNull(billingPrices.tenantId)
      )
    );
}

// I pacchetti al prezzo che vale per questo locale, piu' il suo su misura se
// ce l'ha. Il su misura sta in fondo e non e' un caso: si legge dopo i tre
// standard, come nella conversazione in cui gliel'ho proposto.
export async function getPacchetti(tenantId?: string): Promise<Pacco[]> {
  const trovate = await righe("pacco", tenantId);
  const standard = PACCHETTI.map((p) => {
    // Prima la riga del locale, poi quella globale: il find sull'ordine
    // giusto e' tutta la precedenza.
    const r =
      trovate.find((x) => x.key === p.key && x.tenantId === tenantId) ??
      trovate.find((x) => x.key === p.key && x.tenantId === null);
    if (!r) return p;
    return {
      ...p,
      mensileCents: r.mensileCents,
      annualeCents: r.annualeCents,
      attivazioneCents: r.attivazioneCents,
      assistenzaCents: r.assistenzaCents,
    };
  });

  if (!tenantId) return standard;
  const suo = await getSuMisura(tenantId);
  return suo ? [...standard, suo] : standard;
}

// La chiave e' una stringa e non `PaccoKey`: "su_misura" e' un pacchetto a
// tutti gli effetti per il locale che ce l'ha, e tenerlo fuori dal tipo
// vorrebbe dire un cast a ogni chiamata.
export async function getPaccoPrezzato(
  key: string,
  tenantId?: string
): Promise<Pacco | null> {
  const trovato = (await getPacchetti(tenantId)).find((p) => p.key === key);
  if (trovato) return trovato;
  return isPaccoKey(key) ? getPacco(key) : null;
}

/** Il prezzo di ogni modulo preso da solo, per questo locale. */
export async function getPrezziModuli(
  tenantId?: string
): Promise<Record<ModuleKey, number>> {
  const trovate = await righe("modulo", tenantId);
  const prezzi = { ...PREZZI_MODULI };
  for (const k of MODULE_KEYS) {
    const r =
      trovate.find((x) => x.key === k && x.tenantId === tenantId) ??
      trovate.find((x) => x.key === k && x.tenantId === null);
    if (r) prezzi[k] = r.mensileCents;
  }
  return prezzi;
}

/** Vero se questo locale ha almeno un prezzo suo, diverso dal listino. */
export async function haPrezziSuoi(tenantId: string): Promise<boolean> {
  const sue = await db
    .select({ id: billingPrices.id })
    .from(billingPrices)
    .where(eq(billingPrices.tenantId, tenantId))
    .limit(1);
  return sue.length > 0;
}

async function scrivi(
  scope: "pacco" | "modulo",
  key: string,
  tenantId: string | null,
  valori: PrezzoPacco
): Promise<void> {
  const values = {
    mensileCents: nonNegativo(valori.mensileCents),
    annualeCents: nonNegativo(valori.annualeCents),
    attivazioneCents: nonNegativo(valori.attivazioneCents),
    assistenzaCents: nonNegativo(valori.assistenzaCents),
    updatedAt: new Date(),
  };

  // Due vincoli diversi a seconda che la riga sia globale o di un locale:
  // quella globale e' tenuta unica da un indice parziale, perche' per Postgres
  // due NULL non sono uguali e il vincolo normale la lascerebbe passare due
  // volte.
  const conflitto = tenantId
    ? { target: [billingPrices.scope, billingPrices.key, billingPrices.tenantId] }
    : {
        target: [billingPrices.scope, billingPrices.key],
        targetWhere: isNull(billingPrices.tenantId),
      };

  await db
    .insert(billingPrices)
    .values({ scope, key, tenantId, ...values })
    .onConflictDoUpdate({ ...conflitto, set: values });
}

// La chiave e' una stringa: ci passa anche "su_misura", che pacchetto lo e'
// per il locale che ce l'ha.
export async function salvaPrezzoPacco(
  key: string,
  prezzi: PrezzoPacco,
  tenantId: string | null = null
): Promise<void> {
  await scrivi("pacco", key, tenantId, prezzi);
}

export async function salvaPrezzoModulo(
  key: ModuleKey,
  mensileCents: number,
  tenantId: string | null = null
): Promise<void> {
  await scrivi("modulo", key, tenantId, {
    mensileCents,
    annualeCents: 0,
    attivazioneCents: 0,
    assistenzaCents: 0,
  });
}

// Torna ai prezzi di listino cancellando gli scostamenti di un locale, o
// tutti quelli globali. Cancellare la riga e non riscriverci sopra lo stesso
// numero e' quello che permette di chiedere ancora "e di listino quanto era?".
export async function azzeraScostamenti(
  tenantId: string | null = null
): Promise<void> {
  await db
    .delete(billingPrices)
    .where(
      tenantId ? eq(billingPrices.tenantId, tenantId) : isNull(billingPrices.tenantId)
    );
}

function nonNegativo(v: number): number {
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}
