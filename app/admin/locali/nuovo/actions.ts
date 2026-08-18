"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createLocaleWithSetup } from "@/lib/onboarding";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { saveImage } from "@/lib/uploads";

export type NewLocaleState = { error?: string };

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export async function submitNewLocale(
  _prev: NewLocaleState,
  formData: FormData
): Promise<NewLocaleState> {
  const admin = await getAdminUser();
  if (!admin) return { error: "Sessione scaduta: rifai il login." };

  // Solo i moduli spuntati arrivano nel FormData; gli altri sono da spegnere.
  const modules: Partial<Record<ModuleKey, boolean>> = {};
  for (const m of MODULES) {
    modules[m.key] = formData.get(`modulo_${m.key}`) === "on";
  }

  const logoUrl = await saveImage(formData.get("logo"), text(formData, "slug"));
  const minutes = parseInt(text(formData, "tableSessionMinutes"), 10);
  // Il coperto si scrive in euro ("2,00"), si conserva in centesimi.
  const coperto = parseFloat(
    text(formData, "coverCharge").replace(",", ".").replace(/[^0-9.]/g, "")
  );
  const tableCount = parseInt(text(formData, "tableCount"), 10);

  const result = await createLocaleWithSetup({
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    profile: text(formData, "profile"),
    legalName: text(formData, "legalName"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    province: text(formData, "province"),
    postalCode: text(formData, "postalCode"),
    phone: text(formData, "phone"),
    contactName: text(formData, "contactName"),
    contactEmail: text(formData, "contactEmail"),
    notes: text(formData, "notes"),
    themePreset: text(formData, "themePreset"),
    menuSkin: text(formData, "menuSkin"),
    brandColor: text(formData, "brandColor"),
    brandAccent: text(formData, "brandAccent"),
    logoUrl: logoUrl ?? undefined,
    defaultTheme: text(formData, "defaultTheme"),
    tableSessionMinutes: Number.isInteger(minutes) ? minutes : undefined,
    coverChargeCents: Number.isNaN(coperto) ? 0 : Math.round(coperto * 100),
    tableCount: Number.isInteger(tableCount) ? tableCount : 0,
    modules,
    ownerEmail: text(formData, "ownerEmail"),
    ownerPassword: String(formData.get("ownerPassword") ?? ""),
    invita: formData.get("invita") === "on",
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/admin");
  // L'esito dell'invito viaggia nell'indirizzo, la password no: quella la si
  // rigenera dalla scheda del locale se la mail non e' partita. Le password
  // negli indirizzi finiscono nella cronologia e nei log del server.
  redirect(
    `/admin/locali/${result.tenantId}?creato=1${
      result.invito ? `&invito=${result.invito}` : ""
    }`
  );
}
