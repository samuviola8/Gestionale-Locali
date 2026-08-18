import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env.production.local" });

// Scarica le foto delle bottiglie di marca dalle pagine elencate in
// scripts/foto-bottiglie.json e le aggancia ai prodotti del menu.
//
//   npx tsx scripts/scarica-foto-bottiglie.ts --dry-run
//   npx tsx scripts/scarica-foto-bottiglie.ts --solo "Monkey 47"
//   npx tsx scripts/scarica-foto-bottiglie.ts
//
// Perche' scaricate e non generate: una bottiglia di marca ha un'etichetta
// vera, e un'etichetta inventata da un modello e' un falso che in carta si
// nota. L'elenco tiene l'indirizzo di provenienza di ogni foto, cosi' si sa
// sempre da dove viene e la si puo' sostituire senza ricerche.
//
// Le foto restano di chi le ha scattate: l'elenco privilegia i siti ufficiali
// dei produttori, che le pubblicano per far conoscere il prodotto. Se un
// marchio chiede di toglierla, si cancella la riga e si rilancia.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

type Voce = {
  // Nome esatto del prodotto in menu_products.name.
  prodotto: string;
  // Pagina del prodotto (si legge l'og:image) oppure indirizzo diretto
  // dell'immagine.
  url: string;
  nota?: string;
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const rifai = args.includes("--rifai");
const solo = args.includes("--solo") ? args[args.indexOf("--solo") + 1] : null;

// Il fondo della miniatura nella skin Noya. Le foto ufficiali arrivano quasi
// sempre in PNG con lo sfondo trasparente: appoggiate su questo colore si
// posano nella card invece di stamparci sopra un rettangolo bianco.
const FONDO = { r: 12, g: 12, b: 12 };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

async function scarica(url: string): Promise<Buffer | null> {
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!r.ok) {
    console.log(`   ! http ${r.status}`);
    return null;
  }
  const tipo = r.headers.get("content-type") ?? "";
  if (!tipo.startsWith("image/")) {
    console.log(`   ! non e' un'immagine (${tipo || "tipo assente"})`);
    return null;
  }
  return Buffer.from(await r.arrayBuffer());
}

// Da una pagina di prodotto si prende l'og:image, che e' l'immagine che il
// sito stesso indica come rappresentativa: e' quella giusta piu' spesso di
// qualunque euristica sul primo <img> della pagina.
async function immagineDellaPagina(url: string): Promise<string | null> {
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!r.ok) {
    console.log(`   ! pagina http ${r.status}`);
    return null;
  }

  // Un catalogo che non trova il prodotto non risponde sempre 404: puo'
  // servire la propria pagina generica, con l'og:image della homepage. Il
  // codice prodotto nell'indirizzo finale e' la prova che siamo finiti dove
  // volevamo, e non su una copertina pubblicitaria.
  const codice = /-(P\d+)\.htm/i.exec(url)?.[1];
  if (codice && !r.url.toLowerCase().includes(codice.toLowerCase())) {
    console.log(`   ! la pagina ${codice} non esiste (finita su ${r.url})`);
    return null;
  }

  const html = await r.text();
  const m =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
  if (!m) {
    console.log("   ! nessun og:image nella pagina");
    return null;
  }
  return new URL(m[1], url).toString();
}

function sembraImmagine(url: string): boolean {
  return /\.(png|jpe?g|webp)(\?|$)/i.test(url);
}

// L'og:image e' spesso ritagliato per l'anteprima social: 300 px di larghezza,
// che ingranditi a 640 fanno una bottiglia sfocata. I CDN delle immagini
// accettano la larghezza come parametro, e chiederla piu' grande costa uguale.
function piuGrande(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("width")) return url;
    u.searchParams.set("width", "900");
    u.searchParams.delete("height");
    return u.toString();
  } catch {
    return url;
  }
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function main() {
  const elenco: Voce[] = (await import("./foto-bottiglie.json", { with: { type: "json" } })).default;

  const { db } = await import("@/lib/db");
  const { menuProducts, menuCategories, tenants } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const prodotti = await db
    .select({
      id: menuProducts.id,
      name: menuProducts.name,
      url: menuProducts.imageUrl,
      categoria: menuCategories.name,
      slugLocale: tenants.slug,
    })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .innerJoin(tenants, eq(tenants.id, menuProducts.tenantId));

  const perNome = new Map(prodotti.map((p) => [p.name, p]));

  let fatte = 0;
  let saltate = 0;
  const mancanti: string[] = [];

  for (const v of elenco) {
    if (solo && v.prodotto !== solo) continue;

    const p = perNome.get(v.prodotto);
    if (!p) {
      console.log(`${v.prodotto}\n   ! non esiste nessun prodotto con questo nome`);
      mancanti.push(v.prodotto);
      continue;
    }
    if (p.url && !rifai) {
      saltate++;
      continue;
    }

    console.log(v.prodotto);
    if (dryRun) {
      console.log(`   ${v.url}`);
      continue;
    }

    // Qualunque sia il motivo del fallimento, una foto sbagliata gia' agganciata
    // va staccata. Prima lo si faceva solo per quelle scartate dalle
    // proporzioni, e "Gran Cabaret" e' rimasto in carta con la pubblicita' del
    // rivenditore: era fallito prima, sul reindirizzamento, e quel ramo usciva
    // senza toccare il database.
    const fallita = async () => {
      if (p.url?.includes("/bottiglia-")) {
        await db.update(menuProducts).set({ imageUrl: null }).where(eq(menuProducts.id, p.id));
        console.log("   staccata dal prodotto");
      }
      mancanti.push(v.prodotto);
    };

    const indirizzo = sembraImmagine(v.url) ? v.url : await immagineDellaPagina(v.url);
    if (!indirizzo) {
      await fallita();
      continue;
    }

    const dati = await scarica(piuGrande(indirizzo));
    if (!dati) {
      await fallita();
      continue;
    }

    // Una bottiglia e' alta e stretta. Un'immagine larga quanto alta, o piu',
    // e' quasi sempre una foto d'ambiente o un banner del sito finito li' per
    // sbaglio: meglio nessuna foto che la pubblicita' del rivenditore in
    // mezzo alla carta.
    const meta = await sharp(dati).metadata();
    const alt = meta.height ?? 0;
    const largo = meta.width ?? 0;
    if (alt < largo * 1.2) {
      console.log(`   ! scartata: ${largo}x${alt}, non e' una bottiglia in piedi`);
      await fallita();
      continue;
    }

    const nome = `bottiglia-${slug(p.categoria)}-${slug(p.name)}.webp`;
    const cartella = path.join(process.cwd(), "public", "uploads", p.slugLocale);
    mkdirSync(cartella, { recursive: true });

    // "contain" e non "cover": una bottiglia e' alta e stretta, ritagliarla a
    // quadrato le taglierebbe collo e base, cioe' proprio quello che la rende
    // riconoscibile. Si affianca invece sul fondo scuro della card.
    await sharp(dati)
      .resize(640, 640, { fit: "contain", background: { ...FONDO, alpha: 1 } })
      .flatten({ background: FONDO })
      .webp({ quality: 82 })
      .toFile(path.join(cartella, nome));

    const url = `/uploads/${p.slugLocale}/${nome}`;
    await db.update(menuProducts).set({ imageUrl: url }).where(eq(menuProducts.id, p.id));
    console.log(`   ${url}`);
    fatte++;
  }

  console.log(`\nScaricate ${fatte}, gia' a posto ${saltate}, non riuscite ${mancanti.length}.`);
  if (mancanti.length) {
    // Chi non e' passato va rivisto a mano: quasi sempre e' un sito che
    // risponde 403 agli automatismi, e serve un altro indirizzo nell'elenco.
    writeFileSync(
      path.join(process.cwd(), "scripts", "foto-bottiglie-mancanti.txt"),
      mancanti.join("\n") + "\n"
    );
    for (const m of mancanti) console.log(`   ${m}`);
    console.log("(elenco anche in scripts/foto-bottiglie-mancanti.txt)");
  }
  process.exit(0);
}

main();
