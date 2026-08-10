import { getPreset, type ThemePalette } from "@/lib/themes";

// Traduce la configurazione di branding di un locale nelle variabili CSS che
// l'app gia' usa (--brand, --bg, --text...). Il preset arriva dal codice, gli
// scostamenti dal database.

export type TenantBranding = {
  themePreset: string;
  brandColor: string | null;
  brandAccent: string | null;
  logoUrl: string | null;
  defaultTheme: string;
};

export const DEFAULT_BRANDING: TenantBranding = {
  themePreset: "default",
  brandColor: null,
  brandAccent: null,
  logoUrl: null,
  defaultTheme: "system",
};

// I colori finiscono dentro un tag <style>: accettiamo solo esadecimali,
// cosi' un valore storto in DB non puo' iniettare CSS arbitrario.
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function safeColor(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return HEX.test(trimmed) ? trimmed : null;
}

export function isValidTheme(value: string): value is "dark" | "light" | "system" {
  return value === "dark" || value === "light" || value === "system";
}

// Nero o bianco a seconda di quale si legge meglio sopra il colore dato.
function readableOn(hex: string): string {
  const h = hex.slice(1);
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.45 ? "#000000" : "#ffffff";
}

// Sostituisce il colore brand mantenendo coerenti le tinte derivate.
function withBrand(
  palette: ThemePalette,
  brand: string | null,
  mode: "light" | "dark"
): ThemePalette {
  if (!brand) return palette;
  return {
    ...palette,
    brand,
    // Il brandOn del preset non vale piu': si ricalcola sul colore scelto.
    brandOn: HEX.test(brand) ? readableOn(brand) : palette.brandOn,
    // Con un brand personalizzato anche la testata si ritinge su quel colore.
    heroFrom: `color-mix(in srgb, ${brand} 42%, #0a0a0c)`,
    heroTo: `color-mix(in srgb, ${brand} 10%, #0a0a0c)`,
    brand50:
      mode === "light"
        ? `color-mix(in srgb, ${brand} 14%, #ffffff)`
        : `color-mix(in srgb, ${brand} 22%, ${palette.bg})`,
    brandText:
      mode === "light"
        ? `color-mix(in srgb, ${brand} 80%, #000000)`
        : `color-mix(in srgb, ${brand} 62%, #ffffff)`,
  };
}

function vars(p: ThemePalette): string {
  return [
    `--brand:${p.brand}`,
    `--brand-on:${p.brandOn}`,
    `--brand-50:${p.brand50}`,
    `--brand-text:${p.brandText}`,
    `--bg:${p.bg}`,
    `--surface:${p.surface}`,
    `--surface-2:${p.surface2}`,
    `--text:${p.text}`,
    `--muted:${p.muted}`,
    `--border:${p.border}`,
    `--hero-from:${p.heroFrom}`,
    `--hero-to:${p.heroTo}`,
  ].join(";");
}

// CSS da iniettare nel layout. Sovrascrive i default di globals.css.
export function renderThemeCss(branding: TenantBranding): string {
  const preset = getPreset(branding.themePreset);
  const lightBrand = safeColor(branding.brandColor);
  const darkBrand =
    safeColor(branding.brandAccent) ??
    (lightBrand ? `color-mix(in srgb, ${lightBrand} 72%, #ffffff)` : null);

  const light = withBrand(preset.light, lightBrand, "light");
  const dark = withBrand(preset.dark, darkBrand, "dark");

  // Selettori raddoppiati: cosi' il tema del locale vince su globals.css
  // indipendentemente dall'ordine in cui i due fogli finiscono nell'head.
  return [
    `:root:root{${vars(light)};--font-heading:${preset.fontHeading};--font-body:${preset.fontBody};--heading-tracking:${preset.headingTracking ?? "normal"}}`,
    `:root:root.dark{${vars(dark)}}`,
  ].join("");
}

// Script inline che applica il tema prima del primo paint, evitando il lampo
// bianco. La scelta esplicita dell'utente ha la precedenza sul default del locale.
export function renderThemeScript(defaultTheme: string): string {
  const fallback = isValidTheme(defaultTheme) ? defaultTheme : "system";
  return `(function(){try{var s=localStorage.getItem('theme');var d=s?s==='dark':(${JSON.stringify(
    fallback
  )}==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:${JSON.stringify(
    fallback
  )}==='dark');if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
}
