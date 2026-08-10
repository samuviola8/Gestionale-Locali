// Preset di tema versionati nel codice.
//
// Un locale non ha un file di tema tutto suo: sceglie un preset e ne
// sovrascrive al massimo logo, colore brand e accento (colonne su `tenants`).
// Aggiungere un cliente resta quindi una questione di dati, non di deploy.

export type ThemePalette = {
  brand: string;
  // Colore del testo SOPRA il brand. Senza questo un brand chiaro (bianco,
  // oro) darebbe pulsanti illeggibili, perche' il testo sarebbe bianco su chiaro.
  brandOn: string;
  brand50: string;
  brandText: string;
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  muted: string;
  border: string;
  // Pannello di testata della pagina cliente. E' sempre scuro (il testo sopra
  // e' bianco), ma ogni preset decide quanto tingerlo: derivarlo dal brand
  // renderebbe grigio un brand bianco.
  heroFrom: string;
  heroTo: string;
};

export type ThemePreset = {
  key: string;
  label: string;
  description: string;
  fontHeading: string;
  fontBody: string;
  // Spaziatura extra sui titoli: le identita' minimali la usano molto.
  headingTracking?: string;
  light: ThemePalette;
  dark: ThemePalette;
};

// I font sono caricati da next/font nel layout: qui si referenziano le
// variabili, con fallback di sistema se il font non e' ancora arrivato.
const SANS = `var(--font-inter), system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const SERIF = `var(--font-playfair), Georgia, "Times New Roman", serif`;
const GEOMETRIC = `var(--font-jost), var(--font-inter), system-ui, -apple-system, "Segoe UI", sans-serif`;

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "default",
    label: "Comanda (verde)",
    description: "Il tema storico del prodotto. Neutro, adatto a qualsiasi locale.",
    fontHeading: SANS,
    fontBody: SANS,
    light: {
      brand: "#0f6e56",
      brandOn: "#ffffff",
      brand50: "#e1f5ee",
      brandText: "#085041",
      bg: "#ffffff",
      surface: "#ffffff",
      surface2: "#f6f6f4",
      text: "#1c1c1a",
      muted: "#6b6b66",
      border: "#e7e7e4",
      heroFrom: "#0f5f4a",
      heroTo: "#093629",
    },
    dark: {
      brand: "#1aa483",
      brandOn: "#04231b",
      brand50: "#10342b",
      brandText: "#84e2c6",
      bg: "#0c0e0d",
      surface: "#16191c",
      surface2: "#1d2125",
      text: "#e9eae8",
      muted: "#9aa0a0",
      border: "#2b3036",
      heroFrom: "#0a3a2e",
      heroTo: "#071c17",
    },
  },
  {
    key: "minimal",
    label: "Minimal monocromatico (nero/bianco)",
    description:
      "Identita' senza colore: nero puro, bianco puro, titoli spaziati. Per locali con branding essenziale.",
    fontHeading: GEOMETRIC,
    fontBody: GEOMETRIC,
    headingTracking: "0.14em",
    light: {
      brand: "#000000",
      brandOn: "#ffffff",
      brand50: "#f2f2f2",
      brandText: "#000000",
      bg: "#ffffff",
      surface: "#ffffff",
      surface2: "#f5f5f5",
      text: "#000000",
      muted: "#6e6e6e",
      border: "#e0e0e0",
      heroFrom: "#141414",
      heroTo: "#000000",
    },
    dark: {
      brand: "#ffffff",
      brandOn: "#000000",
      brand50: "#1a1a1a",
      brandText: "#ffffff",
      bg: "#000000",
      surface: "#0d0d0d",
      surface2: "#161616",
      text: "#ffffff",
      muted: "#a1a1a1",
      border: "#2a2a2a",
      heroFrom: "#111111",
      heroTo: "#000000",
    },
  },
  {
    key: "lounge",
    label: "Lounge notturno (nero/oro)",
    description:
      "Cocktail bar e lounge serali: fondo scuro profondo, accento oro caldo, titoli in serif.",
    fontHeading: SERIF,
    fontBody: SANS,
    light: {
      brand: "#8a6d1f",
      brandOn: "#ffffff",
      brand50: "#f6efdc",
      brandText: "#6b5316",
      bg: "#faf7f0",
      surface: "#ffffff",
      surface2: "#f2ece0",
      text: "#1a1712",
      muted: "#6d6559",
      border: "#e3dbcb",
      heroFrom: "#3a2f10",
      heroTo: "#14100a",
    },
    dark: {
      brand: "#c9a227",
      brandOn: "#1c1505",
      brand50: "#2a2210",
      brandText: "#e8cd72",
      bg: "#0a0a0c",
      surface: "#141317",
      surface2: "#1c1b21",
      text: "#f0ece3",
      muted: "#9c968a",
      border: "#2e2c33",
      heroFrom: "#241d0b",
      heroTo: "#0a0a0c",
    },
  },
  {
    key: "pub",
    label: "Pub (ambra)",
    description: "Birrerie e pub: legno, ambra, alto contrasto anche in penombra.",
    fontHeading: SANS,
    fontBody: SANS,
    light: {
      brand: "#a15a12",
      brandOn: "#ffffff",
      brand50: "#fbeedd",
      brandText: "#7d440c",
      bg: "#fffaf4",
      surface: "#ffffff",
      surface2: "#f7efe4",
      text: "#201810",
      muted: "#6f6357",
      border: "#e8dcca",
      heroFrom: "#4a2a08",
      heroTo: "#1a0f04",
    },
    dark: {
      brand: "#e08b32",
      brandOn: "#2a1706",
      brand50: "#33200c",
      brandText: "#f3b871",
      bg: "#0e0b08",
      surface: "#1a1512",
      surface2: "#221c17",
      text: "#f2ebe3",
      muted: "#a2968a",
      border: "#332a22",
      heroFrom: "#2e1c08",
      heroTo: "#0e0b08",
    },
  },
  {
    key: "bistrot",
    label: "Bistrot (bordeaux)",
    description: "Ristoranti e trattorie: bordeaux sobrio su fondo chiaro caldo.",
    fontHeading: SERIF,
    fontBody: SANS,
    light: {
      brand: "#8c2233",
      brandOn: "#ffffff",
      brand50: "#f7e4e7",
      brandText: "#6d1a28",
      bg: "#fffdfb",
      surface: "#ffffff",
      surface2: "#f6f1ee",
      text: "#1d1416",
      muted: "#6d5f61",
      border: "#e9dfdd",
      heroFrom: "#4a1220",
      heroTo: "#1c070c",
    },
    dark: {
      brand: "#c8455a",
      brandOn: "#2b0910",
      brand50: "#33131a",
      brandText: "#f0919f",
      bg: "#0c0809",
      surface: "#181214",
      surface2: "#201819",
      text: "#f0e9ea",
      muted: "#a1918f",
      border: "#332527",
      heroFrom: "#33101a",
      heroTo: "#0c0809",
    },
  },
];

export const DEFAULT_PRESET_KEY = "default";

export function getPreset(key: string | null | undefined): ThemePreset {
  return (
    THEME_PRESETS.find((p) => p.key === key) ??
    THEME_PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)!
  );
}
