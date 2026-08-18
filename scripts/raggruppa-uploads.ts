import { config } from "dotenv";

// In sviluppo la connessione sta in .env.local, sul server di produzione in
// .env.production.local. dotenv non sovrascrive quello che ha gia' letto,
// quindi il primo file che porta DATABASE_URL vince e l'altro e' innocuo.
config({ path: ".env.local" });
config({ path: ".env.production.local" });

// Sposta le immagini da public/uploads (mucchio unico) a public/uploads/<slug
// del locale>, riscrivendo insieme gli indirizzi in menu_products.image_url e
// tenants.logo_url.
//
//   npx tsx scripts/raggruppa-uploads.ts --dry-run
//   npx tsx scripts/raggruppa-uploads.ts
//
// Si puo' rilanciare: quello che sta gia' in una cartella di locale lo salta.
// File e database si muovono insieme, un record alla volta: se si interrompe a
// meta' non restano immagini spostate con l'indirizzo vecchio nel database.

import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";

const dryRun = process.argv.includes("--dry-run");
const UPLOADS = path.join(process.cwd(), "public", "uploads");

// Un indirizzo da spostare e' "/uploads/nomefile": un solo segmento dopo
// uploads. "/uploads/noya-lounge-bar/nomefile" e' gia' a posto.
function fileDaSpostare(url: string | null): string | null {
  if (!url) return null;
  const m = /^\/uploads\/([^/]+)$/.exec(url);
  return m ? m[1] : null;
}

function sposta(file: string, slug: string): string | null {
  const da = path.join(UPLOADS, file);
  const cartella = path.join(UPLOADS, slug);
  const a = path.join(cartella, file);

  if (!existsSync(da)) {
    // Il file puo' essere gia' nella cartella giusta senza che il database lo
    // sappia: in produzione le immagini arrivano da git, che le scrive gia'
    // smistate, mentre gli indirizzi nel database sono ancora quelli piatti.
    // Qui non c'e' niente da spostare, solo da riscrivere.
    if (existsSync(a)) return `/uploads/${slug}/${file}`;

    // Manca davvero: riscrivere l'indirizzo sposterebbe solo il buco.
    console.log(`   ! manca su disco: ${file}`);
    return null;
  }
  if (!dryRun) {
    mkdirSync(cartella, { recursive: true });
    renameSync(da, a);
  }
  return `/uploads/${slug}/${file}`;
}

async function main() {
  const { db } = await import("@/lib/db");
  const { menuProducts, tenants } = await import("@/lib/db/schema");
  const { eq, isNotNull } = await import("drizzle-orm");

  const locali = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name, logoUrl: tenants.logoUrl })
    .from(tenants);
  const slugDi = new Map(locali.map((l) => [l.id, l.slug]));

  let spostati = 0;
  let gia = 0;

  console.log(dryRun ? "PROVA: non tocco niente\n" : "");

  for (const l of locali) {
    const file = fileDaSpostare(l.logoUrl);
    if (!file) continue;
    console.log(`logo ${l.name}`);
    const url = sposta(file, l.slug);
    if (!url) continue;
    if (!dryRun) await db.update(tenants).set({ logoUrl: url }).where(eq(tenants.id, l.id));
    console.log(`   ${url}`);
    spostati++;
  }

  const prodotti = await db
    .select({ id: menuProducts.id, tenantId: menuProducts.tenantId, url: menuProducts.imageUrl, name: menuProducts.name })
    .from(menuProducts)
    .where(isNotNull(menuProducts.imageUrl));

  for (const p of prodotti) {
    const file = fileDaSpostare(p.url);
    if (!file) {
      gia++;
      continue;
    }
    const slug = slugDi.get(p.tenantId);
    if (!slug) continue;
    const url = sposta(file, slug);
    if (!url) continue;
    if (!dryRun) await db.update(menuProducts).set({ imageUrl: url }).where(eq(menuProducts.id, p.id));
    console.log(`${p.name}\n   ${url}`);
    spostati++;
  }

  // Quello che resta nella cartella comune non lo cancello: nessun record lo
  // nomina, ma potrebbe essere una foto sostituita di recente e buttarla e'
  // una decisione da prendere guardandola.
  // In prova non ha spostato niente, quindi l'elenco sarebbe tutto il mucchio:
  // una lista di falsi orfani che spaventa e non dice nulla.
  const rimasti =
    !dryRun && existsSync(UPLOADS)
      ? readdirSync(UPLOADS, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name)
      : [];

  console.log(`\nSpostati ${spostati}, gia' a posto ${gia}.`);
  if (rimasti.length) {
    console.log(`Restano in public/uploads senza un record che li nomini (${rimasti.length}):`);
    for (const r of rimasti) console.log(`   ${r}`);
  }
  process.exit(0);
}

main();
