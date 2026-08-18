import { config } from "dotenv";

config({ path: ".env.local" });

// Genera una foto per ogni prodotto del menu con Nano Banana (estensione
// nanobanana della CLI di Gemini) e la aggancia al prodotto.
//
//   npx tsx scripts/genera-foto-menu.ts --dry-run
//   npx tsx scripts/genera-foto-menu.ts --tenant "Noya Lounge Bar"
//   npx tsx scripts/genera-foto-menu.ts --categoria "Food,Spritz" --limit 3
//
// Prerequisiti (una volta sola):
//   npm install -g @google/gemini-cli
//   gemini extensions install https://github.com/gemini-cli-extensions/nanobanana --consent
//   setx GEMINI_API_KEY "..."      (chiave da https://aistudio.google.com/apikey)
//
// Di default salta i prodotti che una foto ce l'hanno gia': si puo' rilanciare
// dopo un'interruzione senza rigenerare - e ripagare - quello che c'e' gia'.
// Con --rifai le rifa' tutte.
//
// Ogni immagine e' una chiamata a pagamento (~0,04 $ con gemini-2.5-flash-image).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";

type Args = {
  tenant?: string;
  categorie: string[];
  limit?: number;
  rifai: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = { categorie: [], rifai: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--rifai") a.rifai = true;
    else if (v === "--dry-run") a.dryRun = true;
    else if (v === "--tenant") a.tenant = argv[++i];
    // Ripetibile e con la virgola: le categorie da illustrare sono quasi
    // sempre un gruppo ("le bevute vere"), non una sola.
    else if (v === "--categoria") a.categorie.push(...argv[++i].split(",").map((s) => s.trim()));
    else if (v === "--limit") a.limit = parseInt(argv[++i], 10);
  }
  return a;
}

// Le virgolette e gli apostrofi finirebbero dentro la riga di comando passata
// alla CLI: "Hendrick's" spezzerebbe il prompt a meta'.
function pulisci(s: string): string {
  return s.replace(/['"`]/g, "").replace(/\s+/g, " ").trim();
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// Come si fotografa una categoria. Delle bottiglie di marca non si genera mai
// l'etichetta: un'etichetta inventata su una bottiglia riconoscibile e' un
// falso, e in carta stona piu' di una foto assente. Dei distillati si mostra
// quindi il servito nel bicchiere, non la bottiglia, e il nome commerciale
// resta fuori dal prompt (nome: false): "Monkey 47" al modello dice il marchio,
// non la bevanda.
const SCENE: { test: RegExp; scena: string; nome: boolean }[] = [
  {
    test: /gin/i,
    scena:
      "un bicchiere tumbler basso di cristallo con gin liscio trasparente e un cubo di ghiaccio, bacche di ginepro accanto, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /vodka/i,
    scena:
      "un piccolo bicchiere gelato con vodka liscia trasparente, brina sul vetro, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /rum/i,
    scena:
      "un bicchiere tumbler basso con rum ambrato scuro e un cubo di ghiaccio trasparente, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /whisk/i,
    scena:
      "un bicchiere da whisky con distillato dorato e un cubo di ghiaccio trasparente, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /tequila|mezcal/i,
    scena:
      "un bicchierino da tequila con distillato chiaro e una fetta di lime accanto, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /vermouth/i,
    scena:
      "un calice da vermouth con ghiaccio, vino aromatizzato rosso rubino e una scorza d'arancia, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /amar|liquor|after dinner/i,
    scena:
      "un piccolo calice da degustazione con liquore ambrato scuro, scorza di agrume di lato, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /spritz/i,
    scena: "un calice da spritz colmo di ghiaccio, con la fetta di agrume sul bordo, su bancone di legno scuro del bar",
    nome: true,
  },
  {
    test: /signature|iba|cocktail/i,
    scena: "il cocktail servito nel bicchiere adatto, con la sua guarnizione fresca, su bancone di legno scuro del bar",
    nome: true,
  },
  {
    test: /birr/i,
    scena:
      "un bicchiere di birra alla spina con la schiuma compatta e il vetro appannato, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /soft drink|acqua/i,
    scena:
      "un bicchiere alto pieno di ghiaccio con la bibita, gocce di condensa sul vetro, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /bollicine|champagne|spumante/i,
    scena: "un calice flute di vino spumante con il perlage, su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /vin/i,
    scena: "un calice da vino riempito a meta', su bancone di legno scuro del bar",
    nome: false,
  },
  {
    test: /food|cucina/i,
    scena: "il piatto impiattato su ceramica scura, visto di tre quarti dall'alto",
    nome: true,
  },
];

// I soft drink in carta si chiamano col marchio ("Tonica Schweppes", "Indiana
// Fever Tree"), che al modello non dice niente e non va disegnato. Qui si
// traduce il marchio in cosa c'e' davvero nel bicchiere: senza, quattordici
// voci avrebbero lo stesso identico prompt, e quindi la stessa foto pagata
// quattordici volte.
const BIBITE: { test: RegExp; scena: string }[] = [
  { test: /lemon/i, scena: "una soda al limone giallo pallido, con una fetta di limone e molto ghiaccio" },
  { test: /tonica|indiana|indian/i, scena: "un'acqua tonica limpida e frizzante, con uno spicchio di lime e molto ghiaccio" },
  { test: /mediterranea/i, scena: "un'acqua tonica limpida con un rametto di rosmarino e scorza d'agrume, molto ghiaccio" },
  { test: /cola/i, scena: "una cola scura e frizzante con ghiaccio e una fetta di limone" },
  { test: /pompelmo/i, scena: "una soda al pompelmo rosata con una fetta di pompelmo e molto ghiaccio" },
  { test: /ginger beer/i, scena: "una ginger beer ambrata e leggermente torbida, con una radice di zenzero accanto e ghiaccio" },
  { test: /ginger ale/i, scena: "un ginger ale dorato e limpido, con ghiaccio e una fetta di lime" },
  { test: /soda/i, scena: "un seltz limpido e frizzante con ghiaccio e una scorza di limone" },
  { test: /perrier|frizzante|effervescente/i, scena: "un'acqua frizzante limpida con bollicine fitte e ghiaccio" },
  { test: /acqua/i, scena: "un'acqua naturale limpida in un bicchiere alto, senza ghiaccio" },
];

// "Liquori e after dinner" e' lo scaffale piu' vario della carta: un passito,
// un cognac, una grappa bianca e un liquore al cioccolato non si somigliano in
// niente. La scena di categoria li farebbe tutti uguali, quindi qui si guarda
// il nome - senza disegnarne il marchio, solo cosa finisce nel bicchiere.
const DIGESTIVI: { test: RegExp; scena: string }[] = [
  { test: /passito/i, scena: "un calice piccolo da vino dolce con passito ambrato e denso" },
  { test: /cognac/i, scena: "un balloon da cognac con distillato ambrato, scaldato fra le mani" },
  { test: /kahlua|caffe|coffee/i, scena: "un bicchierino con liquore al caffe' scurissimo e chicchi di caffe' accanto" },
  { test: /cioccolat/i, scena: "un bicchierino con liquore al cioccolato denso e scuro, scaglie di cacao accanto" },
  { test: /frangelico|nocciol/i, scena: "un bicchierino con liquore alla nocciola ambrato, nocciole accanto" },
  { test: /drambuie|miele/i, scena: "un tumbler basso con liquore al miele dorato e ghiaccio" },
  { test: /grappa barricata/i, scena: "un calice affusolato da grappa con distillato ambrato da botte" },
  { test: /grappa/i, scena: "un calice affusolato da grappa con distillato trasparente e cristallino" },
  { test: /pisco/i, scena: "un bicchierino con distillato d'uva trasparente e una scorza di lime" },
  { test: /pesca/i, scena: "un bicchierino con liquore alla pesca dorato, una fetta di pesca accanto" },
  { test: /cachaca|cachaça/i, scena: "un bicchierino con distillato di canna trasparente e lime a spicchi" },
  { test: /campari|bitter/i, scena: "un tumbler basso con bitter rosso acceso, ghiaccio e scorza d'arancia" },
  { test: /disaronno|amaretto|mandorl/i, scena: "un tumbler basso con liquore all'amaretto ambrato e ghiaccio" },
  { test: /amarena|ratafia|ciliegi/i, scena: "un bicchierino con liquore all'amarena rosso scuro e amarene accanto" },
];

const STILE =
  "fotografia professionale da menu, luce calda radente, sfondo scuro sfocato di lounge bar, " +
  "profondita' di campo ridotta, composizione quadrata centrata, aspetto appetitoso e pulito, " +
  "senza testo, senza scritte, senza etichette, senza loghi, senza marchi, senza persone, senza mani";

function costruisciPrompt(prodotto: string, categoria: string, descrizione: string | null): string {
  const s = SCENE.find((x) => x.test.test(categoria));

  // Fra i soft drink la differenza sta nella bevanda, non nella categoria:
  // una tonica e una ginger beer non si somigliano per niente.
  const bibita = /soft drink/i.test(categoria)
    ? BIBITE.find((b) => b.test.test(prodotto))?.scena
    : /liquori|after dinner/i.test(categoria)
      ? DIGESTIVI.find((d) => d.test.test(prodotto))?.scena
      : undefined;

  const base = bibita
    ? `${bibita}, su bancone di legno scuro del bar`
    : (s?.scena ?? "il prodotto servito e pronto da bere, su bancone di legno scuro del bar");

  const testa = s?.nome ? `${pulisci(prodotto)}: ` : "";
  const dettaglio = descrizione ? `, ${pulisci(descrizione).slice(0, 160)}` : "";
  return pulisci(`${testa}${base}${dettaglio}. ${STILE}`);
}

const GEMINI = process.platform === "win32" ? "gemini.cmd" : "gemini";

// L'ordine in cui l'estensione nanobanana cerca la chiave: la prima che trova
// vince, quindi GEMINI_API_KEY da sola copre sia la CLI che l'estensione.
const CHIAVI = [
  "NANOBANANA_API_KEY",
  "NANOBANANA_GEMINI_API_KEY",
  "NANOBANANA_GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
];

function fileNuoviIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .map((f) => path.join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

// Una invocazione della CLI per prodotto, in una cartella tutta sua: l'immagine
// che ne esce e' l'unica li' dentro, non serve indovinare quale sia. La
// cartella e' nuova ogni volta e porta il pid nel nome: se un giro precedente
// e' stato interrotto, i suoi processi possono tenere ancora aperta la
// vecchia, e riusare quel nome fa fallire tutto con un EPERM.
function generaImmagine(prompt: string, lavoro: string, chiave: string): string | null {
  mkdirSync(lavoro, { recursive: true });

  const r = spawnSync(GEMINI, ["--yolo", `/generate '${prompt}'`], {
    cwd: lavoro,
    shell: true,
    encoding: "utf8",
    timeout: 5 * 60 * 1000,
    // GEMINI_CLI_TRUST_WORKSPACE: senza, la CLI declassa --yolo a "chiedi
    // conferma" perche' la cartella di lavoro non e' fra quelle fidate, e
    // senza nessuno che risponda non genera niente. La cartella e' una
    // temporanea creata qui sopra: dentro c'e' solo l'immagine appena fatta.
    //
    // NANOBANANA_API_KEY: il server MCP dell'estensione non eredita
    // l'ambiente, riceve solo le variabili dichiarate nel suo manifesto. La
    // chiave la passiamo con quel nome qualunque sia quello da cui arriva.
    env: {
      ...process.env,
      GEMINI_CLI_TRUST_WORKSPACE: "true",
      GEMINI_API_KEY: chiave,
      NANOBANANA_API_KEY: chiave,
    },
  });

  const usciti = fileNuoviIn(path.join(lavoro, "nanobanana-output"));
  if (usciti.length === 0) {
    const motivo = (r.stderr || r.stdout || "nessun output dalla CLI").trim().split("\n").slice(-3).join(" ");
    console.error(`      CLI: ${motivo}`);
    return null;
  }
  return usciti[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Una chiave sola: la CLI la legge da GEMINI_API_KEY per autenticarsi e
  // l'estensione la ritrova con la stessa catena di fallback.
  const chiave = CHIAVI.find((v) => process.env[v]);
  if (!chiave) {
    console.error(
      "Manca la chiave Gemini. Prendila su https://aistudio.google.com/apikey e impostala:\n" +
        '  setx GEMINI_API_KEY "la-tua-chiave"'
    );
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const { menuProducts, menuCategories, tenants } = await import("@/lib/db/schema");
  const { and, eq, inArray, isNull } = await import("drizzle-orm");

  const filtri = [
    args.rifai ? undefined : isNull(menuProducts.imageUrl),
    args.tenant ? eq(tenants.name, args.tenant) : undefined,
    args.categorie.length ? inArray(menuCategories.name, args.categorie) : undefined,
  ].filter(Boolean);

  let righe = await db
    .select({
      id: menuProducts.id,
      name: menuProducts.name,
      description: menuProducts.description,
      categoria: menuCategories.name,
      locale: tenants.name,
      slugLocale: tenants.slug,
    })
    .from(menuProducts)
    .innerJoin(menuCategories, eq(menuCategories.id, menuProducts.categoryId))
    .innerJoin(tenants, eq(tenants.id, menuProducts.tenantId))
    .where(filtri.length ? and(...(filtri as never[])) : undefined)
    .orderBy(tenants.name, menuCategories.sortOrder, menuProducts.sortOrder);

  if (args.limit && args.limit > 0) righe = righe.slice(0, args.limit);

  console.log(`Prodotti da illustrare: ${righe.length}`);
  if (righe.length === 0) process.exit(0);

  const uploads = path.join(process.cwd(), "public", "uploads");
  mkdirSync(uploads, { recursive: true });
  const lavoro = path.join(tmpdir(), "nanobanana-menu");

  let fatte = 0;
  let saltate = 0;

  for (const [i, p] of righe.entries()) {
    const prompt = costruisciPrompt(p.name, p.categoria, p.description);
    const testa = `[${i + 1}/${righe.length}] ${p.locale} / ${p.categoria} / ${p.name}`;

    if (args.dryRun) {
      console.log(`${testa}\n      ${prompt}`);
      continue;
    }

    console.log(testa);
    const generata = generaImmagine(
      prompt,
      path.join(lavoro, `${process.pid}-${i}`),
      process.env[chiave] as string
    );
    if (!generata) {
      console.log("      saltato: nessuna immagine generata");
      saltate++;
      continue;
    }

    // Nano Banana consegna un panorama da 1408x768 e quasi un mega; la card lo
    // mostra in un quadrato da 92 px su un telefono. Ritaglio al centro, dove
    // il soggetto sta sempre, e salvo in webp: da 774 KB si scende sotto i 60.
    const nome = `menu-${slug(p.categoria)}-${slug(p.name)}.webp`;
    const cartella = path.join(uploads, p.slugLocale);
    mkdirSync(cartella, { recursive: true });
    await sharp(generata)
      .resize(640, 640, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toFile(path.join(cartella, nome));
    const url = `/uploads/${p.slugLocale}/${nome}`;

    await db.update(menuProducts).set({ imageUrl: url }).where(eq(menuProducts.id, p.id));
    console.log(`      ${url}`);
    fatte++;
  }

  // Le immagini sono gia' al sicuro in public/uploads: se qualche processo
  // della CLI tiene ancora aperta la sua cartella, la temporanea resta li' e
  // non e' un motivo per far fallire il giro.
  try {
    rmSync(lavoro, { recursive: true, force: true });
  } catch {
    console.log(`(temporanee non rimosse: ${lavoro})`);
  }
  if (!args.dryRun) console.log(`\nFatte ${fatte}, saltate ${saltate}.`);
  process.exit(0);
}

main();
