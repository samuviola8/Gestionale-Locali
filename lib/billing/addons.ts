import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantAddons } from "@/lib/db/schema";
import { MODULES, getModule, isModuleKey, type ModuleKey } from "@/lib/modules";
import { getContratto } from "@/lib/billing/contratti";
import { getPacco, isPaccoKey } from "@/lib/billing/listino";
import { getPrezziModuli } from "@/lib/billing/prezzi";

// I moduli che un locale paga a parte, fuori dal pacchetto: l'agent al
// telefono, la fedelta', il consiglio drink.
//
// Il prezzo lo si scrive qui perche' e' quello concordato con lui. Il listino
// dice 79 e va benissimo come proposta, ma se a questo l'ho fatto a 59 deve
// restare 59 anche il giorno che alzo il listino a 99.

export type Addon = {
  moduleKey: ModuleKey;
  label: string;
  priceCents: number;
};

export async function getAddons(tenantId: string): Promise<Addon[]> {
  const righe = await db
    .select()
    .from(tenantAddons)
    .where(eq(tenantAddons.tenantId, tenantId));
  return righe
    .filter((r) => isModuleKey(r.moduleKey))
    .map((r) => ({
      moduleKey: r.moduleKey as ModuleKey,
      label: getModule(r.moduleKey as ModuleKey).label,
      priceCents: r.priceCents,
    }));
}

export async function totaleAddonsCents(tenantId: string): Promise<number> {
  const addons = await getAddons(tenantId);
  return addons.reduce((s, a) => s + a.priceCents, 0);
}

// Riscrive l'elenco completo: quello che non arriva viene tolto. La pagina
// che lo chiama manda sempre tutte le caselle, quindi togliere la spunta a un
// add-on lo cancella davvero invece di lasciarlo a zero euro in mezzo ai piedi.
export async function salvaAddons(
  tenantId: string,
  addons: { moduleKey: ModuleKey; priceCents: number }[]
): Promise<void> {
  await db.delete(tenantAddons).where(eq(tenantAddons.tenantId, tenantId));
  const validi = addons.filter((a) => isModuleKey(a.moduleKey));
  if (!validi.length) return;
  await db.insert(tenantAddons).values(
    validi.map((a) => ({
      tenantId,
      moduleKey: a.moduleKey,
      priceCents: Math.max(0, Math.round(a.priceCents)),
    }))
  );
}

// Il prezzo da proporre nel pannello quando si spunta un add-on nuovo: quello
// di listino, che poi si corregge a mano se la trattativa e' andata altrimenti.
export async function prezzoProposto(key: ModuleKey): Promise<number> {
  const prezzi = await getPrezziModuli();
  return prezzi[key] ?? 0;
}

// Da moduli accesi a righe da fatturare.
//
// Moduli e add-on erano due elenchi separati degli stessi moduli, e due
// elenchi degli stessi moduli prima o poi si contraddicono: modulo acceso e
// prezzo mai messo vuol dire regalato, prezzo messo e modulo spento vuol dire
// fatturato e non consegnato. Passando sempre di qui, nessuno dei due stati
// esiste — quello che si paga a parte e' esattamente quello che e' acceso, non
// e' gia' compreso nel pacchetto e ha un prezzo suo.
//
// `prezziScritti` sono le caselle appena compilate nel pannello. Quello che
// non arriva tiene il prezzo gia' concordato, e solo in mancanza di entrambi
// si ripiega sul listino.
export async function sincronizzaAddons(
  tenantId: string,
  state: Partial<Record<ModuleKey, boolean>>,
  prezziScritti: Partial<Record<ModuleKey, number>> = {}
): Promise<void> {
  const contratto = await getContratto(tenantId);
  const pacco =
    contratto && isPaccoKey(contratto.pack) ? getPacco(contratto.pack) : null;
  const compresi = new Set<string>(pacco?.moduli ?? []);
  const listino = await getPrezziModuli();
  const concordati = await getAddons(tenantId);

  const daFatturare = MODULES.filter(
    (m) => state[m.key] && !compresi.has(m.key) && listino[m.key] > 0
  ).map((m) => ({
    moduleKey: m.key,
    priceCents:
      prezziScritti[m.key] ??
      concordati.find((a) => a.moduleKey === m.key)?.priceCents ??
      listino[m.key],
  }));

  await salvaAddons(tenantId, daFatturare);
}
