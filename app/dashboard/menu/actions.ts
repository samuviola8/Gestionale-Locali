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

async function requireTenantId(): Promise<string> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return s.tenantId;
}

function splitList(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
  const tenantId = await requireTenantId();
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

  const imageUrl = await saveImage(formData.get("image"));

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
  });
  revalidatePath("/dashboard/menu");
}

export async function setProductImage(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  const url = await saveImage(formData.get("image"));
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
