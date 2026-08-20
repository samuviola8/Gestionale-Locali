import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingPrices } from "@/lib/db/schema";
import { MODULE_KEYS, type ModuleKey } from "@/lib/modules";
import {
  PACCHETTI,
  PREZZI_MODULI,
  getPacco,
  type Pacco,
  type PaccoKey,
} from "@/lib/billing/listino";

// Il listino vero: il catalogo di lib/billing/listino.ts piu' i ritocchi
// fatti dal pannello.
//
// Stessa regola dei moduli: il catalogo vive nel codice, gli scostamenti a
// database. Un pacchetto aggiunto domani nel codice ha subito un prezzo
// sensato senza che nessuno debba ricordarsi di prezzarlo a mano, e un prezzo
// cambiato dal pannello sopravvive al deploy successivo.

export type PrezzoPacco = {
  mensileCents: number;
  annualeCents: number;
  attivazioneCents: number;
  assistenzaCents: number;
};

async function scostamenti(scope: "pacco" | "modulo") {
  return db.select().from(billingPrices).where(eq(billingPrices.scope, scope));
}

/** I pacchetti col prezzo in vigore oggi. */
export async function getPacchetti(): Promise<Pacco[]> {
  const righe = await scostamenti("pacco");
  const perChiave = new Map(righe.map((r) => [r.key, r]));
  return PACCHETTI.map((p) => {
    const r = perChiave.get(p.key);
    if (!r) return p;
    return {
      ...p,
      mensileCents: r.mensileCents,
      annualeCents: r.annualeCents,
      attivazioneCents: r.attivazioneCents,
      assistenzaCents: r.assistenzaCents,
    };
  });
}

export async function getPaccoPrezzato(key: PaccoKey): Promise<Pacco> {
  const righe = await db
    .select()
    .from(billingPrices)
    .where(and(eq(billingPrices.scope, "pacco"), eq(billingPrices.key, key)))
    .limit(1);
  const base = getPacco(key);
  const r = righe[0];
  if (!r) return base;
  return {
    ...base,
    mensileCents: r.mensileCents,
    annualeCents: r.annualeCents,
    attivazioneCents: r.attivazioneCents,
    assistenzaCents: r.assistenzaCents,
  };
}

/** Il prezzo a listino di ogni modulo preso da solo. */
export async function getPrezziModuli(): Promise<Record<ModuleKey, number>> {
  const righe = await scostamenti("modulo");
  const prezzi = { ...PREZZI_MODULI };
  for (const r of righe) {
    if ((MODULE_KEYS as string[]).includes(r.key)) {
      prezzi[r.key as ModuleKey] = r.mensileCents;
    }
  }
  return prezzi;
}

export async function salvaPrezzoPacco(
  key: PaccoKey,
  prezzi: PrezzoPacco
): Promise<void> {
  const values = {
    mensileCents: nonNegativo(prezzi.mensileCents),
    annualeCents: nonNegativo(prezzi.annualeCents),
    attivazioneCents: nonNegativo(prezzi.attivazioneCents),
    assistenzaCents: nonNegativo(prezzi.assistenzaCents),
    updatedAt: new Date(),
  };
  await db
    .insert(billingPrices)
    .values({ scope: "pacco", key, ...values })
    .onConflictDoUpdate({
      target: [billingPrices.scope, billingPrices.key],
      set: values,
    });
}

export async function salvaPrezzoModulo(
  key: ModuleKey,
  mensileCents: number
): Promise<void> {
  const values = { mensileCents: nonNegativo(mensileCents), updatedAt: new Date() };
  await db
    .insert(billingPrices)
    .values({ scope: "modulo", key, ...values })
    .onConflictDoUpdate({
      target: [billingPrices.scope, billingPrices.key],
      set: values,
    });
}

// Torna al prezzo del codice cancellando lo scostamento, invece di
// riscriverci sopra lo stesso numero: cosi' "com'era di listino" resta una
// cosa che si puo' chiedere.
export async function azzeraScostamenti(): Promise<void> {
  await db.delete(billingPrices);
}

function nonNegativo(v: number): number {
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}
