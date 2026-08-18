import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantModules } from "@/lib/db/schema";

// Catalogo dei moduli vendibili. Aggiungerne uno nuovo significa aggiungere
// una voce qui: la UI di amministrazione e i controlli si adeguano da soli,
// senza migrazioni (lo stato per locale vive in `tenant_modules`).

export type ModuleKey =
  | "qr_ordering"
  | "split_bill"
  | "waiter_call"
  | "counter_orders"
  | "reservations"
  | "takeaway"
  | "delivery"
  | "customers"
  | "payments"
  | "ai_suggestions"
  | "loyalty";

export type ModuleDef = {
  key: ModuleKey;
  label: string;
  description: string;
  // Acceso di default sui locali nuovi.
  defaultEnabled: boolean;
  // Add-on a pagamento: mostrato a parte nel pannello admin.
  addon: boolean;
  // Non ancora rilasciato: si puo' configurare ma non attivare.
  comingSoon: boolean;
};

export const MODULES: ModuleDef[] = [
  {
    key: "qr_ordering",
    label: "Ordinazione da QR al tavolo",
    description:
      "Il cliente scansiona il QR, apre il tavolo e ordina dal proprio telefono.",
    defaultEnabled: true,
    addon: false,
    comingSoon: false,
  },
  {
    key: "split_bill",
    label: "Sotto-conti e conto diviso",
    description:
      "Ogni consumazione viene attribuita a una persona, il conto si chiude per singolo nome.",
    defaultEnabled: true,
    addon: false,
    comingSoon: false,
  },
  {
    key: "waiter_call",
    label: "Chiamata cameriere",
    description: "Pulsante per richiamare il personale al tavolo.",
    defaultEnabled: true,
    addon: false,
    comingSoon: false,
  },
  {
    key: "counter_orders",
    label: "Ordine al banco",
    description:
      "Cassa veloce da PC o tablet per chi ordina al bancone, senza tavolo e senza coperto.",
    defaultEnabled: false,
    addon: false,
    comingSoon: false,
  },
  {
    key: "reservations",
    label: "Prenotazione del tavolo",
    description:
      "Il cliente prenota dal sito del locale: sceglie giorno, ora e quante persone, e il tavolo viene assegnato da solo.",
    defaultEnabled: false,
    addon: false,
    comingSoon: false,
  },
  {
    key: "takeaway",
    label: "Asporto",
    description:
      "Ordini da ritirare: ogni ordine è un conto a sé, con il nome di chi passa a prenderlo.",
    defaultEnabled: false,
    addon: false,
    comingSoon: false,
  },
  {
    key: "delivery",
    label: "Consegna a domicilio",
    description:
      "Come l'asporto, più indirizzo, telefono e costo di consegna.",
    defaultEnabled: false,
    addon: false,
    comingSoon: false,
  },
  {
    key: "customers",
    label: "Rubrica clienti",
    description:
      "Nome, telefono e indirizzo di chi ordina: alla cassa basta scrivere il nome e l'anagrafica si compila da sola.",
    defaultEnabled: false,
    addon: false,
    comingSoon: false,
  },
  {
    key: "payments",
    label: "Pagamento Apple/Google Pay",
    description:
      "Pagamento del conto direttamente dal telefono. In sviluppo separato.",
    defaultEnabled: false,
    addon: true,
    comingSoon: true,
  },
  {
    key: "ai_suggestions",
    label: "Agent AI consiglio drink",
    description:
      "Suggerisce cocktail in base a gusti e budget. Add-on ad abbonamento mensile.",
    defaultEnabled: false,
    addon: true,
    comingSoon: true,
  },
  {
    key: "loyalty",
    label: "Programma fedeltà",
    description:
      "Sconti e consumazioni omaggio per i clienti ricorrenti. Add-on ad abbonamento mensile.",
    defaultEnabled: false,
    addon: true,
    comingSoon: true,
  },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as string[]).includes(value);
}

export function getModule(key: ModuleKey): ModuleDef {
  return MODULES.find((m) => m.key === key)!;
}

export type ModuleState = Record<ModuleKey, boolean>;

function defaults(): ModuleState {
  return Object.fromEntries(
    MODULES.map((m) => [m.key, m.defaultEnabled])
  ) as ModuleState;
}

// Stato dei moduli di un locale. Le righe mancanti ricadono sul default del
// catalogo, cosi' un modulo aggiunto dopo funziona anche sui locali esistenti.
export async function getTenantModules(tenantId: string): Promise<ModuleState> {
  const rows = await db
    .select({ moduleKey: tenantModules.moduleKey, enabled: tenantModules.enabled })
    .from(tenantModules)
    .where(eq(tenantModules.tenantId, tenantId));

  const state = defaults();
  for (const row of rows) {
    if (isModuleKey(row.moduleKey)) state[row.moduleKey] = row.enabled;
  }
  return state;
}

export async function hasModule(
  tenantId: string,
  key: ModuleKey
): Promise<boolean> {
  const rows = await db
    .select({ enabled: tenantModules.enabled })
    .from(tenantModules)
    .where(
      and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, key))
    )
    .limit(1);
  return rows[0]?.enabled ?? getModule(key).defaultEnabled;
}

// Scrive lo stato completo dei moduli di un locale.
export async function setTenantModules(
  tenantId: string,
  state: Partial<Record<ModuleKey, boolean>>
): Promise<void> {
  const entries = MODULES.filter((m) => m.key in state).map((m) => ({
    tenantId,
    moduleKey: m.key,
    // Un modulo non ancora rilasciato resta spento comunque.
    enabled: m.comingSoon ? false : !!state[m.key],
  }));
  if (!entries.length) return;

  await db
    .insert(tenantModules)
    .values(entries)
    .onConflictDoUpdate({
      target: [tenantModules.tenantId, tenantModules.moduleKey],
      // `excluded` e' la riga che l'insert stava tentando di scrivere.
      set: { enabled: sql`excluded.enabled` },
    });
}

// Attiva i default del catalogo su un locale appena creato.
export async function seedTenantModules(
  tenantId: string,
  overrides: Partial<Record<ModuleKey, boolean>> = {}
): Promise<void> {
  await db
    .insert(tenantModules)
    .values(
      MODULES.map((m) => ({
        tenantId,
        moduleKey: m.key,
        enabled: m.comingSoon
          ? false
          : (overrides[m.key] ?? m.defaultEnabled),
      }))
    )
    .onConflictDoNothing();
}
