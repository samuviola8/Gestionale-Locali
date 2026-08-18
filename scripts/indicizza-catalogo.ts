import { config } from "dotenv";

config({ path: ".env.local" });

// Costruisce un indice locale del catalogo del rivenditore, leggendo il
// JSON-LD che ogni pagina di elenco incorpora (schema.org ItemList: nome,
// indirizzo e immagine di ogni prodotto).
//
//   npx tsx scripts/indicizza-catalogo.ts
//
// Perche' un indice invece di una ricerca per prodotto: cercare su un motore
// restituisce indirizzi che il catalogo non ha piu' - quando un prodotto esce
// dal listino la sua pagina rimanda alla categoria, e la foto che si scarica
// e' la copertina del sito. Le pagine di elenco invece sono sempre quelle
// vive: quello che c'e' dentro esiste davvero.
//
// L'indice finisce in scripts/catalogo-indice.json e non si rilancia spesso:
// serve una volta per riempire foto-bottiglie.json.

import { writeFileSync } from "node:fs";
import path from "node:path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

// Le categorie che servono al menu di un lounge bar. I codici si leggono dai
// link della pagina "spirits" del catalogo.
const CATEGORIE: { slug: string; categoria: string }[] = [
  { slug: "gin-C16", categoria: "gin" },
  { slug: "rum-C14", categoria: "rum" },
  { slug: "whisky-C13", categoria: "whisky" },
  { slug: "vodka-C17", categoria: "vodka" },
  { slug: "tequila-C21", categoria: "tequila" },
  { slug: "mezcal-C22", categoria: "mezcal" },
  { slug: "liquor-C27", categoria: "liquor" },
  { slug: "grappa-C15", categoria: "grappa" },
  { slug: "cognac-C18", categoria: "cognac" },
  { slug: "spiced-wines-C53", categoria: "spiced-wines" },
  { slug: "champagne-C9", categoria: "champagne" },
  { slug: "sparkling-wines-C8", categoria: "sparkling-wines" },

  // Le pagine di categoria si fermano a cinque schermate: oltre, il catalogo
  // non impagina piu'. Le sotto-tipologie raggiungono quello che resta sotto
  // - un bourbon sta in "whisky" ma anche in "bourbon whisky", e la seconda
  // porta e' meno affollata.
  { slug: "single-malt-whisky-V333", categoria: "whisky" },
  { slug: "blended-whisky-V336", categoria: "whisky" },
  { slug: "bourbon-whisky-V337", categoria: "whisky" },
  { slug: "rye-whisky-V339", categoria: "whisky" },
  { slug: "peated-whisky-V341", categoria: "whisky" },
  { slug: "irish-whisky-V687", categoria: "whisky" },
  { slug: "rum-agricole-french-style-V326", categoria: "rum" },
  { slug: "english-style-rum-V327", categoria: "rum" },
  { slug: "spanish-style-rum-V328", categoria: "rum" },
  { slug: "aged-rum-V330", categoria: "rum" },
  { slug: "vintage-rum-V331", categoria: "rum" },
  { slug: "london-dry-gin-V342", categoria: "gin" },
  { slug: "distilled-gin-V343", categoria: "gin" },
  { slug: "sloe-gin-V345", categoria: "gin" },
  { slug: "compound-bathtub-gin-V346", categoria: "gin" },
  { slug: "vodka-eastern-style-V424", categoria: "vodka" },
  { slug: "vodka-western-style-V444", categoria: "vodka" },

  // I vini non si prendono per categoria - "vini bianchi" sono decine di
  // migliaia di etichette - ma per produttore: la carta ne nomina una
  // dozzina, e la pagina della cantina li elenca tutti.
  { slug: "wines-M1B699", categoria: "vino" },
  { slug: "wines-M1B700", categoria: "vino" },
  { slug: "wines-M1B34", categoria: "vino" },
  { slug: "wines-M1B1189", categoria: "vino" },
  { slug: "wines-M1B1612", categoria: "vino" },
  { slug: "wines-M1B1279", categoria: "vino" },
  { slug: "wines-M1B1132", categoria: "vino" },
];

const PAGINE_MAX = 60;

// La categoria da cui la voce e' stata pescata. Senza, "Red Label" pesca una
// vodka Smirnoff e "Nikka" un gin: le parole tornano, lo scaffale no.
type Voce = { nome: string; url: string; immagine: string; categoria: string };

async function pagina(slug: string, categoria: string, n: number): Promise<Voce[]> {
  const url = `https://www.callmewine.com/en/${slug}.htm?page=${n}`;
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!r.ok) return [];
  const html = await r.text();

  // Le voci dell'ItemList: {"@type":"Product","name":...,"url":...,"image":...}
  const voci: Voce[] = [];
  const re =
    /"@type":"Product","name":"((?:[^"\\]|\\.)*)","url":"([^"]+)","image":"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    voci.push({
      nome: JSON.parse(`"${m[1]}"`),
      url: "https://www.callmewine.com" + m[2],
      immagine: m[3],
      categoria,
    });
  }
  return voci;
}

async function main() {
  const indice = new Map<string, Voce>();

  for (const { slug, categoria } of CATEGORIE) {
    let nuoveInTotale = 0;
    for (let n = 1; n <= PAGINE_MAX; n++) {
      const voci = await pagina(slug, categoria, n);
      if (voci.length === 0) break;
      let nuove = 0;
      for (const v of voci) {
        if (!indice.has(v.url)) {
          indice.set(v.url, v);
          nuove++;
        }
      }
      nuoveInTotale += nuove;
      // Non ci si ferma alla prima pagina senza novita': il catalogo ripete
      // qualche prodotto tra una pagina e l'altra, e fermarsi li' tagliava
      // fuori i tre quarti dello scaffale. Si va avanti finche' una pagina
      // torna vuota davvero.
      void nuove;
    }
    console.log(`${slug}: ${nuoveInTotale}`);
  }

  const fuori = path.join(process.cwd(), "scripts", "catalogo-indice.json");
  writeFileSync(fuori, JSON.stringify([...indice.values()], null, 2));
  console.log(`\n${indice.size} prodotti in ${fuori}`);
  process.exit(0);
}

main();
