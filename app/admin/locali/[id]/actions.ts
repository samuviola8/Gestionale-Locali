"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, users } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { azzeraDueFattori, resettaPassword } from "@/lib/account";
import { GIORNI_PASSWORD_TEMPORANEA } from "@/lib/auth";
import { MODULES, setTenantModules, type ModuleKey } from "@/lib/modules";
import { getPreset } from "@/lib/themes";
import { chiaveSkin } from "@/lib/skins";
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

  // Il logo va nella cartella del locale, e qui abbiamo solo il suo id.
  const locale = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!locale[0]) return;
  const logoUrl = await saveImage(formData.get("logo"), locale[0].slug);

  await db
    .update(tenants)
    .set({
      themePreset: getPreset(String(formData.get("themePreset") ?? "")).key,
      menuSkin: chiaveSkin(String(formData.get("menuSkin") ?? "")),
      menuBranding: formData.get("menuBranding") === "on",
      defaultTheme: isValidTheme(defaultTheme) ? defaultTheme : "system",
      brandColor: safeColor(String(formData.get("brandColor") ?? "")),
      brandAccent: safeColor(String(formData.get("brandAccent") ?? "")),
      // Nessun file caricato: si tiene il logo attuale.
      ...(logoUrl ? { logoUrl } : {}),
    })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
}

/** Il locale obbliga i suoi account alla verifica in due passaggi. Chi non ce
 *  l'ha se la configura al primo accesso: la dashboard non si apre prima. */
export async function toggleDueFattori(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const [cur] = await db
    .select({ v: tenants.twofaRequired })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!cur) return;
  await db
    .update(tenants)
    .set({ twofaRequired: !cur.v })
    .where(eq(tenants.id, id));
  revalidatePath(`/admin/locali/${id}`);
}

export type EsitoAccesso = {
  ok: boolean;
  messaggio: string;
  /** La password temporanea, quando la si mostra invece di mandarla. */
  password?: string;
};

/** Reset della password di un account del locale. È la risposta alla domanda
 *  "e se il titolare perde la password": la rimette il gestore del servizio,
 *  e la nuova arriva per mail — o si detta al telefono, quando la posta non
 *  c'è. */
export async function resettaAccesso(
  userId: string,
  invia: boolean
): Promise<EsitoAccesso> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, messaggio: "Sessione scaduta." };

  const [u] = await db
    .select({ id: users.id, email: users.email, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return { ok: false, messaggio: "Account non trovato." };

  const r = await resettaPassword("user", u.id, invia);
  if (!r.ok) return { ok: false, messaggio: r.errore ?? "Reset non riuscito." };

  revalidatePath(`/admin/locali/${u.tenantId}`);

  if (!invia) {
    return {
      ok: true,
      messaggio: `Password temporanea per ${u.email}, valida ${GIORNI_PASSWORD_TEMPORANEA} giorni. Dettagliela e falla cambiare al primo accesso.`,
      password: r.password,
    };
  }
  if (r.mail === "inviata")
    return { ok: true, messaggio: `Password temporanea mandata a ${u.email}.` };

  // La password è già cambiata: tacere qui vorrebbe dire lasciare fuori il
  // titolare senza che nessuno lo sappia.
  return {
    ok: false,
    messaggio:
      r.mail === "senza-posta"
        ? "Password cambiata, ma non c'è nessuna casella configurata per mandarla: eccola, dettagliela."
        : "Password cambiata, ma la mail non è partita: eccola, dettagliela.",
    password: r.password,
  };
}

/** Il titolare che ha perso il telefono con l'app di autenticazione. */
export async function azzeraAccessoDueFattori(
  userId: string
): Promise<EsitoAccesso> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, messaggio: "Sessione scaduta." };

  const [u] = await db
    .select({ id: users.id, email: users.email, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return { ok: false, messaggio: "Account non trovato." };

  await azzeraDueFattori("user", u.id);
  revalidatePath(`/admin/locali/${u.tenantId}`);
  return { ok: true, messaggio: `${u.email} può rifare la verifica da capo.` };
}

export async function deleteLocale(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(tenants).where(eq(tenants.id, id));
  redirect("/admin");
}
