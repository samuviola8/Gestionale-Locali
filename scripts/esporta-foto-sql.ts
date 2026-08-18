import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.production.local" });

// Esporta le corrispondenze prodotto -> foto come istruzioni SQL, da eseguire
// su un'altra installazione.
//
//   npx tsx scripts/esporta-foto-sql.ts
//
// Serve perche' le immagini viaggiano in git dentro public/uploads/<locale>/,
// ma il legame fra prodotto e foto vive nel database, e ogni installazione ha
// il suo: in produzione arrivano i file e nessuno che li nomini.
//
// L'abbinamento e' su locale + categoria + nome, non sull'id: gli id sono
// diversi da un database all'altro, e il nome del prodotto da solo non basta
// ("Negroni" esiste sia fra i Cocktail sia nella IBA Selection).

import { writeFileSync } from "node:fs";
import path from "node:path";

function q(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

async function main() {
  const { db } = await import("@/lib/db");
  const { menuProducts, menuCategories, tenants } = await import("@/lib/db/schema");
  const { eq, isNotNull } = await import("drizzle-orm");

  const righe = await db
    .select({
      locale: tenants.slug,
      categoria: menuCategories.name,
      prodotto: menuProducts.name,
      url: menuProducts.imageUrl,
    })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .innerJoin(tenants, eq(tenants.id, menuProducts.tenantId))
    .where(isNotNull(menuProducts.imageUrl))
    .orderBy(tenants.slug, menuCategories.name, menuProducts.name);

  const righeSql = righe.map(
    (r) =>
      `UPDATE menu_products p SET image_url = ${q(r.url!)}\n` +
      `  FROM menu_categories c, tenants t\n` +
      `  WHERE p.category_id = c.id AND p.tenant_id = t.id\n` +
      `    AND t.slug = ${q(r.locale)} AND c.name = ${q(r.categoria)} AND p.name = ${q(r.prodotto)}\n` +
      `    AND p.image_url IS NULL;`
  );

  const testa =
    `-- ${righe.length} foto, esportate da questo database.\n` +
    `-- Tocca solo i prodotti che una foto non ce l'hanno: quelle caricate\n` +
    `-- sull'altra installazione non vengono sovrascritte.\n` +
    `--\n` +
    `--   psql "$DATABASE_URL" -f scripts/foto-agganci.sql\n\n` +
    `BEGIN;\n\n`;

  const fuori = path.join(process.cwd(), "scripts", "foto-agganci.sql");
  writeFileSync(fuori, testa + righeSql.join("\n\n") + "\n\nCOMMIT;\n");

  console.log(`${righe.length} corrispondenze in ${fuori}`);
  for (const r of righe.slice(0, 3)) console.log(`   ${r.locale} / ${r.categoria} / ${r.prodotto} -> ${r.url}`);
  process.exit(0);
}

main();
