import { config } from "dotenv";

config({ path: ".env.local" });

// Propone, per ogni prodotto del menu ancora senza foto, i candidati piu'
// somiglianti nell'indice del catalogo (scripts/catalogo-indice.json).
//
//   npx tsx scripts/abbina-catalogo.ts
//   npx tsx scripts/abbina-catalogo.ts --scrivi
//
// Senza --scrivi stampa soltanto: gli abbinamenti vanno letti da un umano
// prima di finire in carta. "Kingstone Chiaro" e "Kingston 62 White" si
// somigliano abbastanza da ingannare un punteggio, non abbastanza da mettere
// la bottiglia sbagliata sotto il naso di un cliente.
//
// Con --scrivi aggiunge a foto-bottiglie.json solo gli abbinamenti sopra la
// soglia alta, lasciando gli incerti da sistemare a mano.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Voce = { nome: string; url: string; immagine: string; categoria: string };

// A quale scaffale del catalogo guardare per ogni categoria della carta.
// Senza questo vincolo "Red Label" trova una vodka Smirnoff e "Nikka
// Whiskey" un gin: le parole coincidono, il prodotto no. Le categorie non
// elencate qui (soft drink, vini fermi) nel catalogo non ci sono: meglio
// nessun candidato che un candidato a caso.
const SCAFFALI: Record<string, string[]> = {
  Gin: ["gin"],
  Rum: ["rum"],
  Whiskey: ["whisky"],
  Vodka: ["vodka"],
  "Tequila e Mezcal": ["tequila", "mezcal"],
  Vermouth: ["spiced-wines"],
  Amari: ["liquor"],
  "Liquori e after dinner": ["liquor", "grappa", "cognac"],
  "Bollicine e Champagne": ["champagne", "sparkling-wines", "vino"],
  "Vini bianchi": ["vino"],
  "Vini rossi e rosati": ["vino"],
};

const scrivi = process.argv.includes("--scrivi");
const SICURO = 0.85;

// Parole che nel catalogo sono etichette di scaffale, non nome del prodotto:
// tenerle gonfierebbe il punteggio di qualunque bottiglia della categoria.
const RUMORE = new Set([
  "gin", "rum", "vodka", "whisky", "whiskey", "tequila", "mezcal", "grappa",
  "cognac", "liquore", "liquor", "single", "malt", "dry", "london", "anni",
  "anno", "years", "old", "cl", "bottiglia", "bottle", "packaging",
  "confezione", "distillato", "blended", "irish", "scotch", "premium",
  "reserva", "reserve", "riserva",
]);

function pezzi(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1);
}

function significativi(s: string): string[] {
  const t = pezzi(s).filter((x) => !RUMORE.has(x));
  // Un nome fatto solo di parole comuni ("Birra media"): meglio tenerle tutte
  // che restare senza niente su cui confrontare.
  return t.length ? t : pezzi(s);
}

// Non basta che le parole della carta tornino nel candidato: conta anche che
// il candidato non ne abbia molte in piu'. "Appleton" sta tutto dentro
// "Hearts Collection Appleton Estate 1984", che pero' e' un'annata da
// collezione, non il rum che si versa al banco. Si pesano quindi le due
// direzioni insieme.
function punteggio(prodotto: string, candidato: string): number {
  const a = significativi(prodotto);
  const b = significativi(candidato);
  if (!a.length || !b.length) return 0;
  const insieme = new Set(b);
  const presenti = a.filter((t) => insieme.has(t)).length;
  if (!presenti) return 0;
  // Conta soprattutto che tutte le parole della carta ci siano; ogni parola
  // di troppo nel candidato toglie un po'. Una in piu' e' normale ("Amaro
  // Montenegro" per "Montenegro"), quattro vogliono dire un'altra bottiglia
  // ("Hearts Collection Appleton Estate 1984" per "Appleton").
  const quanto = presenti / a.length;
  const inPiu = b.length - presenti;
  return Math.max(0, quanto - 0.06 * inPiu);
}

async function main() {
  const indice: Voce[] = JSON.parse(
    readFileSync(path.join(process.cwd(), "scripts", "catalogo-indice.json"), "utf8")
  );

  const { db } = await import("@/lib/db");
  const { menuProducts, menuCategories } = await import("@/lib/db/schema");
  const { eq, isNull } = await import("drizzle-orm");

  const senzaFoto = await db
    .select({ name: menuProducts.name, categoria: menuCategories.name })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .where(isNull(menuProducts.imageUrl))
    .orderBy(menuCategories.sortOrder, menuProducts.sortOrder);

  const gia: { prodotto: string }[] = JSON.parse(
    readFileSync(path.join(process.cwd(), "scripts", "foto-bottiglie.json"), "utf8")
  );
  const giaElencati = new Set(gia.map((g) => g.prodotto));

  const sicuri: { prodotto: string; url: string; nota: string }[] = [];
  let incerti = 0;

  for (const p of senzaFoto) {
    if (giaElencati.has(p.name)) continue;

    const scaffali = SCAFFALI[p.categoria];
    if (!scaffali) {
      console.log(`${p.categoria} / ${p.name}\n   categoria assente dal catalogo`);
      incerti++;
      continue;
    }

    const classifica = indice
      .filter((v) => scaffali.includes(v.categoria))
      .map((v) => ({ v, s: punteggio(p.name, v.nome) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3);

    const top = classifica[0];
    if (!top || top.s === 0) {
      console.log(`${p.categoria} / ${p.name}\n   nessun candidato`);
      incerti++;
      continue;
    }

    const marca = top.s >= SICURO ? "OK  " : "?   ";
    console.log(`${marca}${p.categoria} / ${p.name}`);
    for (const c of classifica) {
      if (c.s > 0) console.log(`      ${c.s.toFixed(2)}  ${c.v.nome}`);
    }

    if (top.s >= SICURO) {
      // Si punta all'immagine dell'indice, non alla pagina del prodotto: la
      // pagina puo' essere gia' sparita dal listino, l'indirizzo dell'immagine
      // e' quello che il catalogo sta servendo adesso.
      sicuri.push({ prodotto: p.name, url: top.v.immagine, nota: `catalogo: ${top.v.nome}` });
    } else {
      incerti++;
    }
  }

  console.log(`\nSicuri ${sicuri.length}, da guardare ${incerti}.`);

  if (scrivi && sicuri.length) {
    const fuori = path.join(process.cwd(), "scripts", "foto-bottiglie.json");
    writeFileSync(fuori, JSON.stringify([...gia, ...sicuri], null, 2) + "\n");
    console.log(`Aggiunti a ${fuori}`);
  }
  process.exit(0);
}

main();
