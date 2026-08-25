import type { ModuleKey } from "@/lib/modules";

// Profili di locale: precompilano tema, moduli e struttura del menu.
// Sono la scorciatoia che rende veloce il terzo, quarto, quinto cliente:
// si sceglie il profilo e si correggono due dettagli, invece di partire da zero.

export type LocaleProfile = {
  key: string;
  label: string;
  description: string;
  themePreset: string;
  defaultTheme: "dark" | "light" | "system";
  // Categorie di partenza del menu: struttura, non contenuto.
  menuCategories: string[];
  moduleOverrides: Partial<Record<ModuleKey, boolean>>;
};

// Il tema di partenza e' scuro per tutti, e non e' una preferenza estetica: il
// menu si guarda dal telefono di chi e' seduto, spesso a luce bassa, e uno
// schermo bianco addosso a mezzanotte e' la prima cosa che fa chiudere la
// pagina. Chi lo vuole chiaro lo cambia dalla scheda del locale — resta una
// riga sola da correggere, mentre "system" lo lascia deciso dal telefono del
// cliente, che e' l'unico che non sa com'e' fatta la sala.
export const PROFILES: LocaleProfile[] = [
  {
    key: "lounge",
    label: "Lounge / cocktail bar",
    description:
      "Locale serale con luci soffuse. Tema scuro di default, categorie orientate alla miscelazione.",
    themePreset: "lounge",
    defaultTheme: "dark",
    menuCategories: [
      "Signature cocktail",
      "Grandi classici",
      "Mocktail",
      "Bollicine e vini",
      "Birre",
      "Food",
    ],
    moduleOverrides: {},
  },
  {
    key: "pub",
    label: "Pub / birreria",
    description: "Consumo veloce e tavolate. Tema scuro, categorie su birre e fritti.",
    themePreset: "pub",
    defaultTheme: "dark",
    menuCategories: [
      "Birre alla spina",
      "Birre in bottiglia",
      "Cocktail",
      "Panini",
      "Fritti e sfizi",
    ],
    moduleOverrides: {},
  },
  {
    key: "ristorante",
    label: "Ristorante / trattoria",
    description: "Servizio al tavolo con portate. Tema scuro, menu per portata.",
    themePreset: "bistrot",
    defaultTheme: "dark",
    menuCategories: [
      "Antipasti",
      "Primi",
      "Secondi",
      "Contorni",
      "Dolci",
      "Bevande",
      "Carta dei vini",
    ],
    // Un ristorante che apre a cena lavora su prenotazione: e' la prima cosa
    // che gli serve, non un extra da scoprire dopo.
    moduleOverrides: { reservations: true },
  },
  {
    key: "vuoto",
    label: "Parti da zero",
    description: "Nessuna categoria precompilata, tema base. Da usare per casi atipici.",
    themePreset: "default",
    defaultTheme: "dark",
    menuCategories: [],
    moduleOverrides: {},
  },
];

export const DEFAULT_PROFILE_KEY = "lounge";

export function getProfile(key: string | null | undefined): LocaleProfile {
  return (
    PROFILES.find((p) => p.key === key) ??
    PROFILES.find((p) => p.key === DEFAULT_PROFILE_KEY)!
  );
}
