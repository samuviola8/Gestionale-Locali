import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuCategories, tenants, users } from "@/lib/db/schema";
import {
  GIORNI_PASSWORD_TEMPORANEA,
  hashPassword,
  passwordTemporanea,
  scadenzaPasswordTemporanea,
} from "@/lib/auth";
import { inviaInvito, linkAccesso, type EsitoInvio } from "@/lib/account-mail";
import { seedTenantModules, type ModuleKey } from "@/lib/modules";
import { avviaProva } from "@/lib/billing/contratti";
import { createTables } from "@/lib/tables";
import { getProfile } from "@/lib/profiles";
import { getPreset } from "@/lib/themes";
import { chiaveSkin } from "@/lib/skins";
import { isValidTheme, safeColor } from "@/lib/branding";

// Creazione completa di un locale: anagrafica, branding, moduli, tavoli,
// struttura del menu e utente titolare. Un solo punto di verita', usato dal
// pannello admin e riutilizzabile da uno script di seed.

export type NewLocaleInput = {
  name: string;
  slug: string;
  profile: string;
  legalName?: string;
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  phone?: string;
  contactName?: string;
  contactEmail?: string;
  notes?: string;
  themePreset?: string;
  menuSkin?: string;
  brandColor?: string;
  brandAccent?: string;
  logoUrl?: string;
  defaultTheme?: string;
  tableSessionMinutes?: number;
  coverChargeCents?: number;
  tableCount?: number;
  modules?: Partial<Record<ModuleKey, boolean>>;
  ownerEmail: string;
  /** Vuota: se ne genera una temporanea, che ha senso solo se parte l'invito. */
  ownerPassword?: string;
  /** Manda al titolare il link d'accesso con le sue credenziali. */
  invita?: boolean;
};

export type NewLocaleResult =
  | {
      ok: true;
      tenantId: string;
      slug: string;
      tables: number;
      categories: number;
      /** Com'è andato l'invito, se lo si è chiesto. */
      invito?: EsitoInvio;
    }
  | { ok: false; error: string };

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    // toglie gli accenti scomposti dalla normalizzazione (perché -> perche)
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Slug riservati: sono sottodomini di servizio, non possono essere locali.
// "comanda" c'e' perche' la vetrina vive li': un locale con quello slug se la
// mangerebbe, e nessuno capirebbe perche' il sito e' sparito.
const RESERVED = new Set([
  "www",
  "admin",
  "api",
  "app",
  "static",
  "assets",
  "mail",
  "comanda",
]);

/** Le regole dell'indirizzo web, in un posto solo: valgono alla creazione e
 *  quando lo si corregge dalla scheda del locale. Due copie di questi
 *  controlli vorrebbero dire, prima o poi, due locali sullo stesso
 *  sottodominio — e uno dei due non si aprirebbe piu'. */
export async function verificaIndirizzoWeb(
  scritto: string,
  escludiTenantId?: string
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const slug = slugify(scritto);
  if (!slug)
    return {
      ok: false,
      error: "L'indirizzo web non e' valido: usa lettere, numeri e trattini.",
    };
  if (RESERVED.has(slug))
    return { ok: false, error: `L'indirizzo «${slug}» e' riservato al sistema.` };

  const preso = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  if (preso[0] && preso[0].id !== escludiTenantId)
    return {
      ok: false,
      error: `L'indirizzo «${slug}» e' gia' usato da un altro locale.`,
    };

  return { ok: true, slug };
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

export async function createLocaleWithSetup(
  input: NewLocaleInput
): Promise<NewLocaleResult> {
  const name = input.name.trim();
  const email = input.ownerEmail.trim().toLowerCase();

  // Password lasciata vuota: se ne genera una temporanea, che il titolare
  // cambia al primo accesso. Ha senso solo se gliela mandiamo — altrimenti
  // sarebbe una porta murata con la chiave dentro.
  const scelta = (input.ownerPassword ?? "").length > 0;
  const password = scelta ? input.ownerPassword! : passwordTemporanea();

  if (!name) return { ok: false, error: "Il nome del locale e' obbligatorio." };
  const indirizzo = await verificaIndirizzoWeb(input.slug || input.name);
  if (!indirizzo.ok) return indirizzo;
  const slug = indirizzo.slug;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "L'email del titolare non e' valida." };
  if (scelta && password.length < 8)
    return {
      ok: false,
      error: "La password del titolare deve avere almeno 8 caratteri.",
    };
  if (!scelta && !input.invita)
    return {
      ok: false,
      error:
        "Senza password devi spuntare l'invito per mail: altrimenti il titolare non avrebbe modo di entrare.",
    };

  const profile = getProfile(input.profile);
  const themePreset = getPreset(input.themePreset ?? profile.themePreset).key;
  const defaultTheme =
    input.defaultTheme && isValidTheme(input.defaultTheme)
      ? input.defaultTheme
      : profile.defaultTheme;
  const minutes = input.tableSessionMinutes;

  const inserted = await db
    .insert(tenants)
    .values({
      slug,
      name,
      legalName: clean(input.legalName),
      address: clean(input.address),
      city: clean(input.city),
      province: clean(input.province),
      postalCode: clean(input.postalCode),
      phone: clean(input.phone),
      contactName: clean(input.contactName),
      contactEmail: clean(input.contactEmail),
      notes: clean(input.notes),
      themePreset,
      menuSkin: chiaveSkin(input.menuSkin),
      brandColor: safeColor(input.brandColor),
      brandAccent: safeColor(input.brandAccent),
      logoUrl: clean(input.logoUrl),
      defaultTheme,
      tableSessionMinutes:
        Number.isInteger(minutes) && minutes! >= 15 && minutes! <= 1440
          ? minutes!
          : 120,
      coverChargeCents:
        Number.isInteger(input.coverChargeCents) && input.coverChargeCents! >= 0
          ? input.coverChargeCents!
          : 0,
    })
    .onConflictDoNothing()
    .returning({ id: tenants.id });

  const tenantId = inserted[0]?.id;
  if (!tenantId)
    return { ok: false, error: "Creazione fallita: indirizzo gia' occupato." };

  await db.insert(users).values({
    tenantId,
    email,
    passwordHash: await hashPassword(password),
    role: "owner",
    // Una password che ha viaggiato per mail non resta la password del
    // locale: al primo accesso se ne sceglie una vera.
    mustChangePassword: !scelta,
    tempPasswordUntil: scelta ? null : scadenzaPasswordTemporanea(),
  });

  await seedTenantModules(tenantId, {
    ...profile.moduleOverrides,
    ...(input.modules ?? {}),
  });

  // Ogni locale nasce in prova. Il contratto vero si scrive dalla sua scheda
  // quando firma: qui si segna solo la data entro cui va richiamato.
  await avviaProva(tenantId);

  const count = input.tableCount ?? 0;
  const tables = count
    ? await createTables(
        tenantId,
        Array.from({ length: Math.min(count, 200) }, (_, i) => i + 1)
      )
    : 0;

  if (profile.menuCategories.length) {
    await db.insert(menuCategories).values(
      profile.menuCategories.map((catName, i) => ({
        tenantId,
        name: catName,
        sortOrder: i + 1,
      }))
    );
  }

  // L'invito parte per ultimo: si manda un locale che esiste davvero, con i
  // tavoli e il menu gia' al loro posto.
  const invito = input.invita
    ? await inviaInvito({
        a: email,
        nome: name,
        link: linkAccesso(slug),
        utente: email,
        passwordTemporanea: password,
        giorni: GIORNI_PASSWORD_TEMPORANEA,
        tenantId,
      })
    : undefined;

  return {
    ok: true,
    tenantId,
    slug,
    tables,
    categories: profile.menuCategories.length,
    invito,
  };
}
