"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { MODULES, setTenantModules, type ModuleKey } from "@/lib/modules";
import { getPreset } from "@/lib/themes";
import { getSkin } from "@/components/skins";
import { isValidTheme, safeColor } from "@/lib/branding";
import { saveImage } from "@/lib/uploads";

export async function renameLocale(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;
  await db.update(tenants).set({ name }).where(eq(tenants.id, id));
  revalidatePath(`/admin/locali/${id}`);
}

export async function toggleSuspend(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const cur = (
    await db
      .select({ suspended: tenants.suspended })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
  )[0];
  if (!cur) return;
  await db.update(tenants).set({ suspended: !cur.suspended }).where(eq(tenants.id, id));
  revalidatePath(`/admin/locali/${id}`);
}

export async function saveModules(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const state: Partial<Record<ModuleKey, boolean>> = {};
  for (const m of MODULES) state[m.key] = formData.get(`modulo_${m.key}`) === "on";

  await setTenantModules(id, state);
  revalidatePath(`/admin/locali/${id}`);
}

// 2,00 / "2.5" / "2" -> centesimi. Vuoto o non numerico = nessun coperto.
function euroToCents(v: string): number {
  const n = parseFloat(v.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

export async function saveService(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const minutes = parseInt(String(formData.get("tableSessionMinutes") ?? ""), 10);

  await db
    .update(tenants)
    .set({
      coverChargeCents: euroToCents(String(formData.get("coverCharge") ?? "")),
      tableSessionMinutes:
        Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440
          ? minutes
          : 120,
    })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
}

export async function saveBranding(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const defaultTheme = String(formData.get("defaultTheme") ?? "");
  const logoUrl = await saveImage(formData.get("logo"));

  await db
    .update(tenants)
    .set({
      themePreset: getPreset(String(formData.get("themePreset") ?? "")).key,
      menuSkin: getSkin(String(formData.get("menuSkin") ?? "")).key,
      defaultTheme: isValidTheme(defaultTheme) ? defaultTheme : "system",
      brandColor: safeColor(String(formData.get("brandColor") ?? "")),
      brandAccent: safeColor(String(formData.get("brandAccent") ?? "")),
      // Nessun file caricato: si tiene il logo attuale.
      ...(logoUrl ? { logoUrl } : {}),
    })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
}

export async function deleteLocale(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(tenants).where(eq(tenants.id, id));
  redirect("/admin");
}
