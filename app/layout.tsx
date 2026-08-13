import type { Metadata } from "next";
import { Inter, Playfair_Display, Jost } from "next/font/google";
import "./globals.css";
import { getTenantFromHost } from "@/lib/tenant-host";
import {
  DEFAULT_BRANDING,
  renderThemeCss,
  renderThemeScript,
} from "@/lib/branding";
import ScrollOrizzontale from "@/components/ScrollOrizzontale";

// Font ospitati da Next in locale: nessuna chiamata a Google a runtime e
// nessuno spostamento del layout al caricamento.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

// Geometrico, sostituto libero di Degular per le identita' minimali.
const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Comanda — ordina al tavolo",
  description:
    "Ordinazione al tavolo via QR, coda ordini per lo staff e conto diviso. Senza app, senza attese.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Sul dominio radice (landing, /admin) non c'e' un locale: si usa il tema base.
  const tenant = await getTenantFromHost();
  const branding = tenant?.branding ?? DEFAULT_BRANDING;

  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${inter.variable} ${playfair.variable} ${jost.variable}`}
    >
      <head>
        <style
          id="tenant-theme"
          dangerouslySetInnerHTML={{ __html: renderThemeCss(branding) }}
        />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: renderThemeScript(branding.defaultTheme),
          }}
        />
        <ScrollOrizzontale />
        {children}
      </body>
    </html>
  );
}
