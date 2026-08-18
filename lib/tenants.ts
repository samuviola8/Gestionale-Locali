import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import type { TenantBranding } from "@/lib/branding";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  suspended: boolean;
  logoUrl: string | null;
  tableSessionMinutes: number;
  // Coperto per persona: serve anche alla pagina del tavolo, per dire al
  // cliente cosa vedra' sul conto prima di ordinare.
  coverChargeCents: number;
  menuSkin: string;
  // Se in fondo al menu compare la riga di chi ha fatto il software.
  menuBranding: boolean;
  // Come si annuncia una chiamata dal tavolo sugli schermi dello staff.
  callSound: string;
  callBlink: boolean;
  branding: TenantBranding;
};

const columns = {
  id: tenants.id,
  slug: tenants.slug,
  name: tenants.name,
  suspended: tenants.suspended,
  themePreset: tenants.themePreset,
  brandColor: tenants.brandColor,
  brandAccent: tenants.brandAccent,
  logoUrl: tenants.logoUrl,
  defaultTheme: tenants.defaultTheme,
  tableSessionMinutes: tenants.tableSessionMinutes,
  coverChargeCents: tenants.coverChargeCents,
  menuSkin: tenants.menuSkin,
  menuBranding: tenants.menuBranding,
  callSound: tenants.callSound,
  callBlink: tenants.callBlink,
};

type Row = {
  [K in keyof typeof columns]: K extends "suspended" | "callBlink" | "menuBranding"
    ? boolean
    : K extends "tableSessionMinutes" | "coverChargeCents"
      ? number
      : K extends "brandColor" | "brandAccent" | "logoUrl"
        ? string | null
        : string;
};

function toTenant(row: Row): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    suspended: row.suspended,
    logoUrl: row.logoUrl,
    tableSessionMinutes: row.tableSessionMinutes,
    coverChargeCents: row.coverChargeCents,
    menuSkin: row.menuSkin,
    menuBranding: row.menuBranding,
    callSound: row.callSound,
    callBlink: row.callBlink,
    branding: {
      themePreset: row.themePreset,
      brandColor: row.brandColor,
      brandAccent: row.brandAccent,
      logoUrl: row.logoUrl,
      defaultTheme: row.defaultTheme,
    },
  };
}

// Lookup del locale dal database.
export async function getTenant(slug: string): Promise<Tenant | null> {
  const normalized = slug.toLowerCase();
  const rows = await db
    .select(columns)
    .from(tenants)
    .where(eq(tenants.slug, normalized))
    .limit(1);
  return rows[0] ? toTenant(rows[0]) : null;
}
