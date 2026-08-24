"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuProducts,
  menuProductVariants,
  tenants,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { saveImage } from "@/lib/uploads";
import { getTenantModules } from "@/lib/modules";

async function requireTenantId(): Promise<string> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return s.tenantId;
}

// Chi carica una foto ha bisogno anche dello slug: le immagini si salvano
// nella cartella del locale, non in un mucchio comune a tutti i clienti.
async function requireLocale(): Promise<{ tenantId: string; slug: string }> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return { tenantId: s.tenantId, slug: s.tenantSlug };
}

function splitList(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}


// Le spunte "si porta via" e "si consegna" arrivano solo dai locali che quei
// canali ce li hanno: dove il modulo e' spento la casella non compare in
// pagina, e un'assenza non deve spegnere un prodotto. Senza questo controllo,
// il giorno che il canale torna il locale si ritroverebbe l'intero menu
// escluso dall'asporto senza averlo mai deciso.
async function canaliDelProdotto(
  tenantId: string,
  formData: FormData
): Promise<{ takeawayAvailable?: boolean; deliveryAvailable?: boolean }> {
  const modules = await getTenantModules(tenantId);
  return {
    ...(modules.takeaway
      ? { takeawayAvailable: formData.get("asporto") === "on" }
      : {}),
    ...(modules.delivery
      ? { deliveryAvailable: formData.get("domicilio") === "on" }
      : {}),
  };
}
function euroToCents(v: string): number {
  const n = parseFloat(v.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) ? 0 : Math.round(n * 100);
}

// Il coperto e' una scelta di listino: lo decide il locale, senza passare dal
// gestore del servizio.
export async function setCoverCharge(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const raw = String(formData.get("coverCharge") ?? "").trim();
  // Campo vuoto = il locale non applica il coperto.
  const cents = raw ? euroToCents(raw) : 0;
  if (cents < 0 || cents > 10000) return;

  await db
    .update(tenants)
    .set({ coverChargeCents: cents })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/menu");
}

export async function addCategory(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await db.insert(menuCategories).values({ tenantId, name });
  revalidatePath("/dashboard/menu");
}

export async function addProduct(formData: FormData): Promise<void> {
  const { tenantId, slug } = await requireLocale();
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const ingredients = splitList(formData.get("ingredients"));
  const allergens = splitList(formData.get("allergens"));
  const priceCents = euroToCents(String(formData.get("price") ?? ""));

  if (!name || !categoryId || priceCents <= 0) return;

  const cat = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(
      and(eq(menuCategories.id, categoryId), eq(menuCategories.tenantId, tenantId))
    )
    .limit(1);
  if (!cat[0]) return;

  const imageUrl = await saveImage(formData.get("image"), slug);

  await db.insert(menuProducts).values({
    tenantId,
    categoryId,
    name,
    description,
    imageUrl,
    ingredients,
    allergens,
    priceCents,
    acceptsNote: formData.get("acceptsNote") === "on",
    requiresGlasses: formData.get("requiresGlasses") === "on",
    ...(await canaliDelProdotto(tenantId, formData)),
  });
  revalidatePath("/dashboard/menu");
}

// Correggere quello che c'e' gia': un prezzo che cambia, un nome scritto male,
// un allergene dimenticato. Prima si poteva solo cancellare il prodotto e
// rifarlo da capo — e rifarlo voleva dire perdere formati, ingredienti e foto,
// che stanno tutti attaccati alla riga vecchia.
//
// Restano fuori le cose che hanno gia' un interruttore loro: esaurito,
// preferito, calici, ingredienti e formati si toccano dalla riga.
export async function updateProduct(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const allergens = splitList(formData.get("allergens"));
  const priceCents = euroToCents(String(formData.get("price") ?? ""));

  // Stessi paletti della creazione: un prodotto senza nome o a prezzo zero
  // sarebbe una riga che al banco nessuno sa battere.
  if (!id || !name || !categoryId || priceCents <= 0) return;

  // La categoria arriva dal modulo: senza questo controllo si potrebbe
  // spostare un prodotto dentro la sezione di un altro locale.
  const cat = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(
      and(eq(menuCategories.id, categoryId), eq(menuCategories.tenantId, tenantId))
    )
    .limit(1);
  if (!cat[0]) return;

  await db
    .update(menuProducts)
    .set({
      categoryId,
      name,
      description,
      allergens,
      priceCents,
      acceptsNote: formData.get("acceptsNote") === "on",
      ...(await canaliDelProdotto(tenantId, formData)),
    })
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)));
  revalidatePath("/dashboard/menu");
}

export async function setProductImage(formData: FormData): Promise<void> {
  const { tenantId, slug } = await requireLocale();
  const id = String(formData.get("id") ?? "");
  const url = await saveImage(formData.get("image"), slug);
  if (!id || !url) return;
  await db
    .update(menuProducts)
    .set({ imageUrl: url })
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)));
  revalidatePath("/dashboard/menu");
}

export async function toggleAvailable(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  const rows = await db
    .select({ available: menuProducts.available })
    .from(menuProducts)
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)))
    .limit(1);
  if (rows[0]) {
    await db
      .update(menuProducts)
      .set({ available: !rows[0].available })
      .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)));
  }
  revalidatePath("/dashboard/menu");
}

export async function addVariant(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const productId = String(formData.get("productId") ?? "");
  const name = String(formData.get("variantName") ?? "").trim();
  const priceCents = euroToCents(String(formData.get("variantPrice") ?? ""));
  if (!productId || !name || priceCents <= 0) return;

  const owned = await db
    .select({ id: menuProducts.id })
    .from(menuProducts)
    .where(and(eq(menuProducts.id, productId), eq(menuProducts.tenantId, tenantId)))
    .limit(1);
  if (!owned[0]) return;

  await db
    .insert(menuProductVariants)
    .values({ tenantId, productId, name, priceCents })
    .onConflictDoNothing();
  revalidatePath("/dashboard/menu");
}

export async function deleteVariant(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  await db
    .delete(menuProductVariants)
    .where(
      and(eq(menuProductVariants.id, id), eq(menuProductVariants.tenantId, tenantId))
    );
  revalidatePath("/dashboard/menu");
}

// I preferiti stanno in cima alla cassa al banco. Su un menu da centocinquanta
// voci l'operatore non puo' cercare: i dieci piu' richiesti devono stare sotto
// al dito, e quali siano lo sa solo il locale.
export async function togglePinned(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const rows = await db
    .select({ pinned: menuProducts.pinned })
    .from(menuProducts)
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) return;

  await db
    .update(menuProducts)
    .set({ pinned: !rows[0].pinned })
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)));
  revalidatePath("/dashboard/menu");
}

// Il vino si porta in bottiglia, e la bottiglia da sola non si beve: qui si
// dice quali prodotti devono chiedere i calici prima di finire nel carrello.
// E' un interruttore e non un dato di creazione perche' le bottiglie a menu ci
// sono gia' tutte: chiedere di rifarle una per una per una spunta nuova non
// avrebbe senso.
export async function toggleRequiresGlasses(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const rows = await db
    .select({ requiresGlasses: menuProducts.requiresGlasses })
    .from(menuProducts)
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) return;

  await db
    .update(menuProducts)
    .set({ requiresGlasses: !rows[0].requiresGlasses })
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)));
  revalidatePath("/dashboard/menu");
}

// Gli ingredienti non servono solo a far bello il menu: da questi nascono le
// scorciatoie "senza gin" che il cliente tocca invece di scrivere. Un prodotto
// senza ingredienti resta ordinabile, ma con la sola nota a mano libera.
export async function addIngredient(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const productId = String(formData.get("productId") ?? "");
  const nome = String(formData.get("ingredient") ?? "").trim().slice(0, 40);
  if (!productId || !nome) return;

  const rows = await db
    .select({ ingredients: menuProducts.ingredients })
    .from(menuProducts)
    .where(and(eq(menuProducts.id, productId), eq(menuProducts.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) return;

  // Niente doppioni: darebbero due chip identiche nel foglio della nota.
  const attuali = rows[0].ingredients;
  if (attuali.some((i) => i.toLowerCase() === nome.toLowerCase())) return;

  await db
    .update(menuProducts)
    .set({ ingredients: [...attuali, nome] })
    .where(and(eq(menuProducts.id, productId), eq(menuProducts.tenantId, tenantId)));
  revalidatePath("/dashboard/menu");
}

export async function deleteIngredient(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const productId = String(formData.get("productId") ?? "");
  const nome = String(formData.get("ingredient") ?? "");
  if (!productId || !nome) return;

  const rows = await db
    .select({ ingredients: menuProducts.ingredients })
    .from(menuProducts)
    .where(and(eq(menuProducts.id, productId), eq(menuProducts.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) return;

  await db
    .update(menuProducts)
    .set({ ingredients: rows[0].ingredients.filter((i) => i !== nome) })
    .where(and(eq(menuProducts.id, productId), eq(menuProducts.tenantId, tenantId)));
  revalidatePath("/dashboard/menu");
}

export async function deleteProduct(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  await db
    .delete(menuProducts)
    .where(and(eq(menuProducts.id, id), eq(menuProducts.tenantId, tenantId)));
  revalidatePath("/dashboard/menu");
}
