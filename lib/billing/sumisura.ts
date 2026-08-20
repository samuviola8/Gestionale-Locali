import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantCustomPacks } from "@/lib/db/schema";
import { isModuleKey, type ModuleKey } from "@/lib/modules";
import { getPacco, isPaccoKey, type Pacco } from "@/lib/billing/listino";

// Il pacchetto su misura di un locale.
//
// I tre standard sanno dire un prezzo ma non sanno dire una composizione
// diversa: "Pro senza asporto, con la consegna" non esiste a listino e non
// deve esistere — se lo mettessi a listino diventerebbe il quarto pacchetto
// per tutti. Sta qui, intestato a lui, e vive accanto agli altri tre.

export const CHIAVE_SU_MISURA = "su_misura";

export type PaccoSuMisura = Pacco & { suMisura: true };

function moduliValidi(v: unknown): ModuleKey[] {
  if (!Array.isArray(v)) return [];
  return v.filter((k): k is ModuleKey => typeof k === "string" && isModuleKey(k));
}

export async function getSuMisura(
  tenantId: string
): Promise<PaccoSuMisura | null> {
  const righe = await db
    .select()
    .from(tenantCustomPacks)
    .where(eq(tenantCustomPacks.tenantId, tenantId))
    .limit(1);
  const r = righe[0];
  if (!r) return null;
  return {
    key: CHIAVE_SU_MISURA,
    label: r.label,
    descrizione: r.descrizione ?? "Composto su misura per questo locale.",
    moduli: moduliValidi(r.moduli),
    mensileCents: r.mensileCents,
    annualeCents: r.annualeCents,
    attivazioneCents: r.attivazioneCents,
    assistenzaCents: r.assistenzaCents,
    suMisura: true,
  };
}

export type DatiSuMisura = {
  label: string;
  descrizione: string | null;
  moduli: ModuleKey[];
  mensileCents: number;
  annualeCents: number;
  attivazioneCents: number;
  assistenzaCents: number;
};

export async function salvaSuMisura(
  tenantId: string,
  dati: DatiSuMisura
): Promise<void> {
  const values = {
    label: dati.label.trim() || "Su misura",
    descrizione: dati.descrizione?.trim() || null,
    moduli: dati.moduli.filter(isModuleKey),
    mensileCents: Math.max(0, Math.round(dati.mensileCents)),
    annualeCents: Math.max(0, Math.round(dati.annualeCents)),
    attivazioneCents: Math.max(0, Math.round(dati.attivazioneCents)),
    assistenzaCents: Math.max(0, Math.round(dati.assistenzaCents)),
    updatedAt: new Date(),
  };
  await db
    .insert(tenantCustomPacks)
    .values({ tenantId, ...values })
    .onConflictDoUpdate({ target: tenantCustomPacks.tenantId, set: values });
}

// Cancellarlo e' un'altra cosa dal non usarlo: finche' esiste, il locale puo'
// sempre tornarci. Si toglie solo quando l'accordo e' finito davvero.
export async function eliminaSuMisura(tenantId: string): Promise<void> {
  await db.delete(tenantCustomPacks).where(eq(tenantCustomPacks.tenantId, tenantId));
}

// Cosa comprende, nel canone, il pacchetto che questo locale ha firmato.
//
// E' l'unica risposta a "questo modulo si paga a parte o e' gia' dentro?", e
// deve passare tutta di qui: prima il su misura si leggeva dal catalogo del
// codice, dove non c'e', e il risultato era che a un locale su misura
// risultava compreso niente — cioe' ogni modulo acceso diventava un add-on a
// pagamento.
export async function moduliDelPacco(
  tenantId: string,
  pack: string
): Promise<ModuleKey[]> {
  if (pack === CHIAVE_SU_MISURA) {
    return (await getSuMisura(tenantId))?.moduli ?? [];
  }
  return isPaccoKey(pack) ? getPacco(pack).moduli : [];
}
