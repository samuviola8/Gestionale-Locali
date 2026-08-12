import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuProducts,
  menuProductVariants,
} from "@/lib/db/schema";

export type MenuVariant = {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
};

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  ingredients: string[];
  allergens: string[];
  priceCents: number;
  available: boolean;
  // Vuoto = prodotto a prezzo unico, si ordina con un tocco.
  variants: MenuVariant[];
};

export type MenuCategory = {
  id: string;
  name: string;
  products: MenuProduct[];
};

// Restituisce il menu di un locale, raggruppato per categoria.
export async function getMenu(tenantId: string): Promise<MenuCategory[]> {
  const cats = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.tenantId, tenantId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));

  const prods = await db
    .select()
    .from(menuProducts)
    .where(eq(menuProducts.tenantId, tenantId))
    .orderBy(asc(menuProducts.sortOrder), asc(menuProducts.name));

  const variants = await db
    .select()
    .from(menuProductVariants)
    .where(eq(menuProductVariants.tenantId, tenantId))
    .orderBy(asc(menuProductVariants.sortOrder), asc(menuProductVariants.name));

  const byProduct = new Map<string, MenuVariant[]>();
  for (const v of variants) {
    const list = byProduct.get(v.productId) ?? [];
    list.push({
      id: v.id,
      name: v.name,
      priceCents: v.priceCents,
      available: v.available,
    });
    byProduct.set(v.productId, list);
  }

  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    products: prods
      .filter((p) => p.categoryId === c.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        imageUrl: p.imageUrl,
        ingredients: p.ingredients,
        allergens: p.allergens,
        priceCents: p.priceCents,
        available: p.available,
        variants: byProduct.get(p.id) ?? [],
      })),
  }));
}

// --- Backoffice: il menu si sfoglia una categoria per volta -----------------
//
// Sono due funzioni separate di proposito. Il guscio della pagina (titolo,
// coperto, pillole delle categorie) ha bisogno solo dei nomi e dei conteggi:
// tenendolo indipendente dai prodotti puo' comparire subito, mentre l'elenco
// arriva dopo in streaming.

export type MenuCategorySummary = {
  id: string;
  name: string;
  productCount: number;
};

export async function getMenuCategories(
  tenantId: string
): Promise<MenuCategorySummary[]> {
  const cats = await db
    .select({ id: menuCategories.id, name: menuCategories.name })
    .from(menuCategories)
    .where(eq(menuCategories.tenantId, tenantId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name));

  // Conteggio fatto dal database: non serve portarsi a casa i prodotti.
  const conteggi = await db
    .select({ categoryId: menuProducts.categoryId, n: count() })
    .from(menuProducts)
    .where(eq(menuProducts.tenantId, tenantId))
    .groupBy(menuProducts.categoryId);

  const perCategoria = new Map(conteggi.map((c) => [c.categoryId, c.n]));

  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    productCount: perCategoria.get(c.id) ?? 0,
  }));
}

// Quanti prodotti sono ancora senza foto: e' il promemoria in cima alla
// pagina. Conta il database, non serve caricarli.
export async function countProductsWithoutPhoto(
  tenantId: string
): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(menuProducts)
    .where(
      and(eq(menuProducts.tenantId, tenantId), isNull(menuProducts.imageUrl))
    );
  return rows[0]?.n ?? 0;
}

// Prodotti (con i loro formati) di una sola categoria.
export async function getCategoryProducts(
  tenantId: string,
  categoryId: string
): Promise<MenuProduct[]> {
  const prods = await db
    .select()
    .from(menuProducts)
    .where(
      and(
        eq(menuProducts.tenantId, tenantId),
        eq(menuProducts.categoryId, categoryId)
      )
    )
    .orderBy(asc(menuProducts.sortOrder), asc(menuProducts.name));

  if (!prods.length) return [];

  const variants = await db
    .select()
    .from(menuProductVariants)
    .where(eq(menuProductVariants.tenantId, tenantId))
    .orderBy(asc(menuProductVariants.sortOrder), asc(menuProductVariants.name));

  const byProduct = new Map<string, MenuVariant[]>();
  for (const v of variants) {
    const list = byProduct.get(v.productId) ?? [];
    list.push({
      id: v.id,
      name: v.name,
      priceCents: v.priceCents,
      available: v.available,
    });
    byProduct.set(v.productId, list);
  }

  return prods.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    ingredients: p.ingredients,
    allergens: p.allergens,
    priceCents: p.priceCents,
    available: p.available,
    variants: byProduct.get(p.id) ?? [],
  }));
}

export { formatPrice } from "@/lib/format";
