import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
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
  // Il cliente scrive cosa desidera invece di scegliere una variante.
  acceptsNote: boolean;
  // In cima alla cassa al banco. Non cambia niente lato cliente.
  pinned: boolean;
  // Valorizzata solo dalla ricerca: fuori dalla propria sezione, una riga
  // senza categoria non dice dove si trova il prodotto.
  categoria?: string;
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
        acceptsNote: p.acceptsNote,
        pinned: p.pinned,
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

  return conVarianti(tenantId, prods);
}

// Cerca in tutto il menu, non nella categoria aperta: chi cerca "negroni" non
// sa in quale sezione sta, ed e' il motivo per cui sta cercando. Il nome della
// categoria torna insieme al prodotto, altrimenti i risultati sono righe senza
// contesto.
//
// Il tetto a 50 non e' cautela: e' il patto della pagina, che carica una
// categoria per volta perche' centocinquanta prodotti insieme pesavano
// megabyte. Una ricerca che riportasse tutto lo romperebbe.
export async function searchProducts(
  tenantId: string,
  testo: string
): Promise<MenuProduct[]> {
  const q = testo.trim();
  if (!q) return [];

  // Si cerca dall'inizio di una parola, non ovunque dentro il nome: con la
  // sottostringa secca "gin" pescava anche lo Champagne "Brut Ori-gin-e".
  // \m e' il confine di parola di Postgres, e tiene conto anche dei trattini,
  // cosi' "germain" trova "St-Germain".
  const inizioParola = `\\m${q.replace(/[.^$*+?()[\]{}|\\-]/g, "\\$&")}`;

  const righe = await db
    .select({ prodotto: menuProducts, categoria: menuCategories.name })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .where(
      and(
        eq(menuProducts.tenantId, tenantId),
        sql`${menuProducts.name} ~* ${inizioParola}`
      )
    )
    .orderBy(asc(menuProducts.name))
    .limit(50);

  const conFormati = await conVarianti(
    tenantId,
    righe.map((r) => r.prodotto)
  );
  const categoriaDi = new Map(righe.map((r) => [r.prodotto.id, r.categoria]));
  return conFormati.map((p) => ({ ...p, categoria: categoriaDi.get(p.id) }));
}

// Attacca a ogni prodotto i suoi formati. Le varianti si leggono in una query
// sola per tutto il locale: sono poche, e una query per prodotto su un elenco
// di cinquanta sarebbe cinquanta viaggi al database.
async function conVarianti(
  tenantId: string,
  prods: (typeof menuProducts.$inferSelect)[]
): Promise<MenuProduct[]> {
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
    acceptsNote: p.acceptsNote,
    pinned: p.pinned,
  }));
}

export { formatPrice } from "@/lib/format";
