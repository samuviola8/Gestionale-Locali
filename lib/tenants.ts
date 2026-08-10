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
  menuSkin: string;
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
  menuSkin: tenants.menuSkin,
};

type Row = {
  [K in keyof typeof columns]: K extends "suspended"
    ? boolean
    : K extends "tableSessionMinutes"
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
    menuSkin: row.menuSkin,
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
