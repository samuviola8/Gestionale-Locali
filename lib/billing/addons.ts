import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantAddons } from "@/lib/db/schema";
import {
  MODULES,
  getModule,
  getTenantModules,
  isModuleKey,
  setTenantModules,
  type ModuleKey,
} from "@/lib/modules";
import { getContratto } from "@/lib/billing/contratti";
import { moduliDelPacco } from "@/lib/billing/sumisura";

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

// Accende i moduli del pacchetto scelto, lasciando accesi gli add-on che il
// locale paga a parte.
//
// Senza questo, scegliere "Tutto" non darebbe niente di nuovo: cambierebbe
// solo la cifra. E scendendo di piano i moduli del piano vecchio resterebbero
// accesi e gratis. Gli add-on sopravvivono al cambio perche' non fanno parte
// del pacchetto: si pagano a parte, e chi li paga se li tiene.
export async function applicaModuliDelPacco(
  tenantId: string,
  pack: string
): Promise<void> {
  const compresi = await moduliDelPacco(tenantId, pack);
  const addons = await getAddons(tenantId);
  const tenuti = new Set<string>([
    ...compresi,
    ...addons.map((a) => a.moduleKey),
  ]);

  const state = await getTenantModules(tenantId);
  for (const m of MODULES) state[m.key] = tenuti.has(m.key);
  await setTenantModules(tenantId, state);
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
  const compresi = new Set<string>(
    contratto ? await moduliDelPacco(tenantId, contratto.pack) : []
  );
  const concordati = await getAddons(tenantId);

  // Non se ne creano di nuovi, e questo e' il cambio: accendere un modulo
  // fuori pacchetto non lo fattura piu' a parte.
  //
  // Sommare add-on a listino era il metodo vecchio, e faceva un prezzo che non
  // avevo deciso io: un Base con cinque moduli accesi finiva a 130 al mese
  // mentre Premium, che li comprende tutti, ne costa 45. Adesso una
  // composizione fuori dai tre standard e' un **pacchetto su misura**, con il
  // suo prezzo e il suo nome — che e' una cosa che si concorda, non una somma
  // che esce da sola.
  //
  // Quelli gia' concordati restano, e restano al loro prezzo: un add-on che
  // gli ho fatto a 59 vale 59 anche adesso, e toglierglielo d'ufficio vorrebbe
  // dire cambiargli il contratto senza dirglielo.
  const restano = concordati
    // Ma si toglie quello che non ha piu' motivo di esserci: modulo spento, o
    // entrato nel pacchetto. Senza questo, chi passa a un piano che comprende
    // le prenotazioni continuerebbe a pagarle a parte — cioe' due volte.
    .filter((a) => state[a.moduleKey] && !compresi.has(a.moduleKey))
    .map((a) => ({
      moduleKey: a.moduleKey,
      priceCents: prezziScritti[a.moduleKey] ?? a.priceCents,
    }));

  await salvaAddons(tenantId, restano);
}
