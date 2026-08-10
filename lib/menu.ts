import { asc, eq } from "drizzle-orm";
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

export { formatPrice } from "@/lib/format";
