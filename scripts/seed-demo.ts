import { config } from "dotenv";

config({ path: ".env.local" });

// I tre locali dimostrativi: un ristorante, un lounge bar e una gelateria.
//
//   $env:DEMO_OWNER_PASSWORD="..."; npx tsx scripts/seed-demo.ts
//   npx tsx scripts/seed-demo.ts --solo gelateria-nivara
//
// Servono a far vedere il prodotto a chi non l'ha mai visto: tre mestieri
// diversi, tre menu corti ma assortiti, tutti col pacchetto Pro acceso. Le
// foto dei piatti si fanno dopo, con scripts/genera-foto-menu.ts.
//
// Rilanciarlo rifa' il locale da zero. Cancella solo tenant col flag `demo`
// alzato: un locale vero non e' raggiungibile da qui nemmeno sbagliando slug.
//
// E' anche il modo di portarli in produzione: le immagini viaggiano in git,
// questo file e' il menu, e lanciarlo sul server rifa' li' gli stessi tre
// locali con le stesse foto. Niente dump da spostare — un dump si porterebbe
// dietro anche gli id, e gli id di un database non valgono in un altro.
//
// Perche' il contratto resta in "prova" e non "attivo": un attivo entra nel
// giro dei rinnovi, e fra trenta giorni ci si ritrova una bozza di fattura da
// 89 euro intestata a un locale che non esiste. La prova senza scadenza non
// fattura niente e non fa scattare il blocco per prova scaduta, e il
// pacchetto scritto sul contratto — Pro — e' comunque quello che accende i
// moduli.

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

type Voce = {
  nome: string;
  descrizione?: string;
  prezzo?: number; // euro; assente se ha varianti
  varianti?: { nome: string; prezzo: number }[];
  allergeni?: string[];
  /** Uno di quelli che si ordinano sempre: sta in cima alla cassa al banco. */
  inCima?: boolean;
};

type Categoria = { nome: string; voci: Voce[] };

type Locale = {
  nome: string;
  slug: string;
  profilo: string;
  themePreset: string;
  menuSkin: string;
  temaPredefinito: "dark" | "light";
  indirizzo: string;
  citta: string;
  provincia: string;
  cap: string;
  telefono: string;
  note: string;
  coperto: number; // euro
  tavoli: number;
  /** Orari: 0 = lunedi, 6 = domenica. I giorni assenti sono di chiusura. */
  orari: Record<string, { da: string; a: string }[]>;
  /** Da quale altro locale copiare le foto, quando il prodotto e' lo stesso. */
  fotoDa?: string;
  menu: Categoria[];
};

const OSTERIA: Locale = {
  nome: "Osteria del Melograno",
  slug: "osteria-del-melograno",
  profilo: "ristorante",
  themePreset: "bistrot",
  menuSkin: "base",
  temaPredefinito: "dark",
  indirizzo: "Via delle Zagare 18",
  citta: "Catania",
  provincia: "CT",
  cap: "95124",
  telefono: "+39 095 000 0011",
  note:
    "Locale dimostrativo: cucina siciliana di mare e di terra. Menu corto e " +
    "inventato, serve a far vedere il prodotto a un ristorante.",
  coperto: 2,
  tavoli: 14,
  orari: {
    "1": [
      { da: "12:30", a: "15:00" },
      { da: "19:30", a: "23:00" },
    ],
    "2": [
      { da: "12:30", a: "15:00" },
      { da: "19:30", a: "23:00" },
    ],
    "3": [
      { da: "12:30", a: "15:00" },
      { da: "19:30", a: "23:00" },
    ],
    "4": [
      { da: "12:30", a: "15:00" },
      { da: "19:30", a: "23:30" },
    ],
    "5": [
      { da: "12:30", a: "15:00" },
      { da: "19:30", a: "23:30" },
    ],
    "6": [{ da: "12:30", a: "15:30" }],
  },
  menu: [
    {
      nome: "Antipasti",
      voci: [
        {
          nome: "Caponata catanese",
          descrizione: "Melanzane, sedano, olive e capperi, servita tiepida",
          prezzo: 7,
        },
        {
          nome: "Tartare di tonno rosso e agrumi",
          descrizione: "Tonno del giorno, arancia tarocco, finocchietto e olio nuovo",
          prezzo: 14,
          allergeni: ["Pesce"],
        },
        {
          nome: "Polpo arrosto su crema di ceci",
          descrizione: "Polpo scottato alla brace, ceci di Leonforte, rosmarino",
          prezzo: 13,
          allergeni: ["Molluschi"],
        },
      ],
    },
    {
      nome: "Primi",
      voci: [
        {
          nome: "Spaghetti alla Norma",
          descrizione: "Pomodoro fresco, melanzane fritte, ricotta salata e basilico",
          prezzo: 12,
          allergeni: ["Glutine", "Latte"],
          inCima: true,
        },
        {
          nome: "Busiate al pesto di pistacchio",
          descrizione: "Pistacchio di Bronte, pecorino e scorza di limone",
          prezzo: 14,
          allergeni: ["Glutine", "Frutta a guscio", "Latte"],
        },
        {
          nome: "Risotto al nero di seppia",
          descrizione: "Seppia fresca, vino bianco e prezzemolo",
          prezzo: 15,
          allergeni: ["Molluschi", "Solfiti"],
        },
        {
          nome: "Pasta con le sarde",
          descrizione:
            "Sarde, finocchietto selvatico, uvetta, pinoli e mollica atturrata",
          prezzo: 13,
          allergeni: ["Glutine", "Pesce", "Frutta a guscio"],
        },
      ],
    },
    {
      nome: "Secondi",
      voci: [
        {
          nome: "Pesce spada alla ghiotta",
          descrizione: "Pomodoro, capperi, olive e cipolla stufata",
          prezzo: 18,
          allergeni: ["Pesce"],
        },
        {
          nome: "Filetto di manzo al Nero d'Avola",
          descrizione: "Riduzione di vino rosso e patate schiacciate",
          prezzo: 22,
          allergeni: ["Solfiti", "Latte"],
        },
        {
          nome: "Frittura di paranza",
          descrizione: "Pesce azzurro, gamberi e calamari del giorno, limone",
          prezzo: 16,
          allergeni: ["Pesce", "Crostacei", "Molluschi", "Glutine"],
        },
      ],
    },
    {
      nome: "Contorni",
      voci: [
        { nome: "Patate al forno al rosmarino", prezzo: 5 },
        {
          nome: "Insalata di arance, finocchi e olive",
          descrizione: "Arance tarocco, finocchi croccanti, olive nere",
          prezzo: 6,
        },
      ],
    },
    {
      nome: "Dolci",
      voci: [
        {
          nome: "Cannolo siciliano espresso",
          descrizione: "Riempito al momento, ricotta di pecora e pistacchio",
          prezzo: 6,
          allergeni: ["Glutine", "Latte", "Frutta a guscio", "Uova"],
        },
        {
          nome: "Semifreddo al pistacchio",
          descrizione: "Con granella di Bronte e cioccolato fondente",
          prezzo: 7,
          allergeni: ["Latte", "Frutta a guscio", "Uova"],
        },
      ],
    },
    {
      nome: "Cantina e bevande",
      voci: [
        {
          nome: "Etna Rosso DOC",
          descrizione: "Nerello mascalese, versante nord",
          varianti: [
            { nome: "Calice", prezzo: 6 },
            { nome: "Bottiglia", prezzo: 28 },
          ],
          allergeni: ["Solfiti"],
        },
        {
          nome: "Birra artigianale siciliana 33 cl",
          descrizione: "Bionda non filtrata",
          prezzo: 5,
          allergeni: ["Glutine"],
        },
        { nome: "Acqua minerale 75 cl", prezzo: 2.5 },
      ],
    },
  ],
};

// Il lounge e' Noya con un altro nome e senza logo: stesso tema, stessa skin,
// stesso taglio di carta. E' voluto — quello e' l'unico allestimento vero che
// ho, e rifarlo diverso vorrebbe dire mostrare qualcosa che non ho mai messo
// in mano a nessuno. Le voci sono le sue, quindi anche le foto lo sono: si
// copiano invece di ripagarle a Nano Banana.
const AUREA: Locale = {
  nome: "Aurea Lounge Bar",
  slug: "aurea-lounge",
  profilo: "lounge",
  themePreset: "minimal",
  menuSkin: "noya",
  temaPredefinito: "dark",
  indirizzo: "Viale della Libertà 92",
  citta: "Catania",
  provincia: "CT",
  cap: "95129",
  telefono: "+39 095 000 0022",
  note:
    "Locale dimostrativo: lounge bar serale con cucina. Allestito come Noya " +
    "Lounge Bar — stessa skin, stesso taglio di carta — senza il suo nome e " +
    "senza il suo logo.",
  coperto: 2,
  tavoli: 12,
  orari: {
    "2": [{ da: "18:30", a: "23:30" }],
    "3": [{ da: "18:30", a: "23:30" }],
    "4": [{ da: "18:30", a: "23:59" }],
    "5": [{ da: "18:30", a: "23:59" }],
    "6": [{ da: "18:30", a: "23:30" }],
  },
  fotoDa: "noya-lounge",
  menu: [
    {
      nome: "Signature",
      voci: [
        {
          nome: "Basil Gin Sour",
          descrizione: "Basilico, lime, gin e sciroppo di zucchero",
          prezzo: 14,
          inCima: true,
        },
        {
          nome: "Peach Gin Fizz",
          descrizione: "Gin infuso alla pesca, cordiale al lime e top soda al pompelmo",
          prezzo: 14,
        },
        {
          nome: "Spritz Passion",
          descrizione:
            "Sciroppo al passion fruit, Aperol, Prosecco e top di ginger beer",
          prezzo: 14,
          allergeni: ["Solfiti"],
        },
        {
          nome: "Coffee Velvet",
          descrizione:
            "Caffe, Kahlua, vodka, sciroppo di zucchero e top di velluto alle mandorle",
          prezzo: 14,
          allergeni: ["Frutta a guscio"],
        },
      ],
    },
    {
      nome: "IBA Selection",
      voci: [
        {
          nome: "Negroni",
          descrizione: "Gin, vermouth rosso, Campari",
          prezzo: 12,
          inCima: true,
        },
        {
          nome: "Old Fashioned",
          descrizione: "Bourbon whiskey, zolletta di zucchero, dash angostura, dash soda",
          prezzo: 12,
        },
        {
          nome: "Paloma",
          descrizione: "Tequila, succo di lime, sale, soda al pompelmo rosa",
          prezzo: 12,
        },
        {
          nome: "Naked and Famous",
          descrizione: "Mezcal, Aperol, Chartreuse Gialla, succo di lime",
          prezzo: 12,
        },
      ],
    },
    {
      nome: "Food",
      voci: [
        {
          nome: "Tartare di tonno",
          descrizione: "Tonno, avocado, mango e cialda di riso soffiato",
          prezzo: 14,
          allergeni: ["Pesce"],
        },
        {
          nome: "Gamberi in tempura homemade",
          descrizione: "5 pezzi",
          prezzo: 10,
          allergeni: ["Crostacei", "Glutine", "Uova"],
        },
        {
          nome: "Avocado toast-beef",
          descrizione: "Pane tostato, crema di avocado, roast beef e scaglie di grana",
          prezzo: 13,
          allergeni: ["Glutine", "Latte"],
        },
        { nome: "Patata fresca stick", descrizione: "500 g", prezzo: 5, inCima: true },
      ],
    },
    {
      nome: "Bollicine e Champagne",
      voci: [
        { nome: "Biancavigna — Prosecco DOCG Brut", prezzo: 20, allergeni: ["Solfiti"] },
        {
          nome: "Cusumano — 700 Metodo Classico Sicilia",
          prezzo: 35,
          allergeni: ["Solfiti"],
        },
      ],
    },
    {
      nome: "Birre",
      voci: [
        {
          nome: "24 Baroni alla spina",
          varianti: [
            { nome: "Bionda", prezzo: 6 },
            { nome: "Rossa", prezzo: 6 },
          ],
          allergeni: ["Glutine"],
        },
      ],
    },
    {
      nome: "Amari",
      voci: [
        {
          nome: "Amaro del Capo",
          varianti: [
            { nome: "Porzione", prezzo: 5 },
            { nome: "Shot", prezzo: 3 },
          ],
        },
        {
          nome: "Jagermeister",
          varianti: [
            { nome: "Porzione", prezzo: 5 },
            { nome: "Shot", prezzo: 3 },
          ],
        },
      ],
    },
  ],
};

const NIVARA: Locale = {
  nome: "Gelateria Nivara",
  slug: "gelateria-nivara",
  // Nessuno dei profili somiglia a una gelateria: le categorie precompilate
  // sarebbero tutte da buttare, e allora si parte dal vuoto.
  profilo: "vuoto",
  themePreset: "default",
  menuSkin: "base",
  temaPredefinito: "dark",
  indirizzo: "Piazza dei Mandorli 4",
  citta: "Aci Trezza",
  provincia: "CT",
  cap: "95021",
  telefono: "+39 095 000 0033",
  note:
    "Locale dimostrativo: gelateria con granite e asporto. Serve a far vedere " +
    "il prodotto dove il conto e' piccolo e il banco e' veloce.",
  // Al banco non si paga il coperto.
  coperto: 0,
  tavoli: 8,
  orari: {
    "0": [{ da: "15:00", a: "23:30" }],
    "1": [{ da: "15:00", a: "23:30" }],
    "2": [{ da: "15:00", a: "23:30" }],
    "3": [{ da: "15:00", a: "23:30" }],
    "4": [{ da: "10:00", a: "23:59" }],
    "5": [{ da: "10:00", a: "23:59" }],
    "6": [{ da: "10:00", a: "23:59" }],
  },
  menu: [
    {
      nome: "Coni e coppette",
      voci: [
        {
          nome: "Cono piccolo",
          descrizione: "Un gusto a scelta",
          prezzo: 2.5,
          inCima: true,
        },
        {
          nome: "Cono medio",
          descrizione: "Due gusti a scelta piu' panna",
          prezzo: 3.5,
          inCima: true,
        },
        {
          nome: "Coppetta maxi",
          descrizione: "Tre gusti a scelta piu' panna",
          prezzo: 4.5,
        },
      ],
    },
    {
      nome: "Coppe gelato",
      voci: [
        {
          nome: "Coppa Etna",
          descrizione: "Pistacchio, cioccolato fondente e granella di Bronte",
          prezzo: 7.5,
          allergeni: ["Latte", "Frutta a guscio"],
        },
        {
          nome: "Coppa amarena",
          descrizione: "Fiordilatte, amarene sciroppate e panna",
          prezzo: 6.5,
          allergeni: ["Latte"],
        },
        {
          nome: "Affogato al caffe",
          descrizione: "Fiordilatte annegato nell'espresso",
          prezzo: 4.5,
          allergeni: ["Latte"],
        },
        {
          nome: "Banana split",
          descrizione: "Banana, tre gusti, panna e granella di nocciola",
          prezzo: 8,
          allergeni: ["Latte", "Frutta a guscio"],
        },
      ],
    },
    {
      nome: "Granite e brioche",
      voci: [
        { nome: "Granita di limone", prezzo: 3, inCima: true },
        { nome: "Granita di mandorla", prezzo: 3.5, allergeni: ["Frutta a guscio"] },
        { nome: "Granita al pistacchio", prezzo: 4, allergeni: ["Frutta a guscio"] },
        {
          nome: "Brioche col tuppo",
          descrizione: "Appena sfornata",
          prezzo: 1.8,
          allergeni: ["Glutine", "Uova", "Latte"],
          inCima: true,
        },
      ],
    },
    {
      nome: "Crepes e waffle",
      voci: [
        {
          nome: "Crepe nocciola e granella",
          prezzo: 6,
          allergeni: ["Glutine", "Latte", "Frutta a guscio", "Uova"],
        },
        {
          nome: "Waffle ai frutti di bosco",
          descrizione: "Con panna montata",
          prezzo: 6.5,
          allergeni: ["Glutine", "Uova", "Latte"],
        },
        {
          nome: "Cannolo gelato",
          descrizione: "Scorza croccante riempita di gelato alla ricotta",
          prezzo: 4.5,
          allergeni: ["Glutine", "Latte"],
        },
      ],
    },
    {
      nome: "Vaschette da asporto",
      voci: [
        {
          nome: "Vaschetta di gelato",
          descrizione: "Gusti a scelta, con ghiaccio secco su richiesta",
          varianti: [
            { nome: "250 g", prezzo: 6 },
            { nome: "500 g", prezzo: 11 },
            { nome: "750 g", prezzo: 15 },
          ],
          allergeni: ["Latte"],
        },
      ],
    },
    {
      nome: "Bevande",
      voci: [
        { nome: "Frappe alla fragola", prezzo: 4.5, allergeni: ["Latte"] },
        { nome: "Caffe espresso", prezzo: 1.2 },
        { nome: "Acqua naturale 50 cl", prezzo: 1 },
      ],
    },
  ],
};

const LOCALI = [OSTERIA, AUREA, NIVARA];

function cents(euro: number): number {
  return Math.round(euro * 100);
}

// Lo stesso slug che usa genera-foto-menu.ts per dare il nome al file: e' con
// quello che si ritrova la foto gia' fatta dell'identico prodotto.
function slugFoto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// I canali del sito: il Pro comprende l'asporto, non la consegna. Le mail
// restano spente perche' un locale finto non deve scrivere a nessuno.
function canaliWeb() {
  return {
    asporto: {
      attivo: true,
      passoMinuti: 15,
      preavvisoMinuti: 20,
      giorniAvanti: 3,
      minimoCents: 0,
      accettazioneAutomatica: false,
      mailConferme: false,
      mailAggiornamenti: false,
      mailLocale: false,
      nota: "Il ritiro si tiene 15 minuti oltre l'orario concordato.",
    },
    domicilio: {
      attivo: false,
      passoMinuti: 30,
      preavvisoMinuti: 45,
      giorniAvanti: 7,
      minimoCents: 0,
      accettazioneAutomatica: false,
      mailConferme: false,
      mailAggiornamenti: false,
      mailLocale: false,
      nota: null,
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const solo = argv.includes("--solo") ? argv[argv.indexOf("--solo") + 1] : null;

  const password = process.env.DEMO_OWNER_PASSWORD;
  if (!password) {
    console.error(
      "Manca DEMO_OWNER_PASSWORD. Esempio:\n" +
        '  $env:DEMO_OWNER_PASSWORD="..."; npx tsx scripts/seed-demo.ts'
    );
    process.exit(1);
  }

  const { db } = await import("@/lib/db");
  const {
    menuCategories,
    menuProducts,
    menuProductVariants,
    tenantBilling,
    tenants,
  } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { createLocaleWithSetup } = await import("@/lib/onboarding");
  const { salvaContratto } = await import("@/lib/billing/contratti");
  const { applicaModuliDelPacco, sincronizzaAddons } = await import(
    "@/lib/billing/addons"
  );
  const { getTenantModules } = await import("@/lib/modules");

  const uploads = path.join(process.cwd(), "public", "uploads");

  for (const locale of LOCALI) {
    if (solo && solo !== locale.slug) continue;

    // Rifare vuol dire ripartire da zero. Si cancella solo se e' una demo: se
    // quello slug se l'e' preso un locale vero ci si ferma, perche' la riga
    // dopo gli porterebbe via il menu.
    const esistente = await db
      .select({ id: tenants.id, demo: tenants.demo })
      .from(tenants)
      .where(eq(tenants.slug, locale.slug))
      .limit(1);
    if (esistente[0]) {
      if (!esistente[0].demo) {
        console.error(`${locale.slug}: indirizzo occupato da un locale vero, salto.`);
        continue;
      }
      await db.delete(tenants).where(eq(tenants.id, esistente[0].id));
      console.log(`${locale.slug}: demo precedente rimossa.`);
    }

    const creato = await createLocaleWithSetup({
      name: locale.nome,
      slug: locale.slug,
      profile: locale.profilo,
      address: locale.indirizzo,
      city: locale.citta,
      province: locale.provincia,
      postalCode: locale.cap,
      phone: locale.telefono,
      notes: locale.note,
      themePreset: locale.themePreset,
      menuSkin: locale.menuSkin,
      defaultTheme: locale.temaPredefinito,
      coverChargeCents: cents(locale.coperto),
      tableCount: locale.tavoli,
      // Dominio riservato dalla RFC: una mail scritta li' non arriva a
      // nessuno nemmeno per sbaglio.
      ownerEmail: `titolare@${locale.slug}.invalid`,
      ownerPassword: password,
      invita: false,
    });
    if (!creato.ok) {
      console.error(`${locale.slug}: creazione fallita — ${creato.error}`);
      continue;
    }
    const tenantId = creato.tenantId;

    await db
      .update(tenants)
      .set({
        demo: true,
        // Nessuna scadenza: queste tre non sono la demo di un prospect da
        // ripulire fra un mese, sono il campionario e devono restare.
        demoExpiresAt: null,
        openingHours: locale.orari,
        webOrderChannels: canaliWeb(),
        // Quanti pezzi regge una fascia: dieci bastano a far vedere come si
        // riempie la coda senza doverla riempire davvero.
        webOrderPiecesPerSlot: 10,
        // Una demo non chiede recensioni a nessuno.
        reviewsEnabled: false,
      })
      .where(eq(tenants.id, tenantId));

    // Pacchetto Pro, canone zero e nessuna scadenza: i moduli sono quelli del
    // Pro, ma il locale non entra ne' nei rinnovi ne' nei blocchi.
    await salvaContratto(tenantId, {
      model: "abbonamento",
      pack: "locale",
      period: "mensile",
      recurringCents: 0,
      activationCents: 0,
      transactionBps: 0,
      status: "prova",
      notes: "Locale dimostrativo: piano Pro acceso, niente da fatturare.",
    });
    await db
      .update(tenantBilling)
      .set({ trialEndsAt: null, nextInvoiceAt: null })
      .where(eq(tenantBilling.tenantId, tenantId));
    await applicaModuliDelPacco(tenantId, "locale");
    await sincronizzaAddons(tenantId, await getTenantModules(tenantId));

    // Il profilo ha lasciato le sue categorie vuote: al loro posto va il menu.
    await db.delete(menuCategories).where(eq(menuCategories.tenantId, tenantId));

    let prodotti = 0;
    let varianti = 0;
    let copiate = 0;
    let riagganciate = 0;

    for (const [ci, cat] of locale.menu.entries()) {
      const inserita = await db
        .insert(menuCategories)
        .values({ tenantId, name: cat.nome, sortOrder: ci + 1 })
        .returning({ id: menuCategories.id });
      const categoryId = inserita[0].id;

      for (const [pi, voce] of cat.voci.entries()) {
        // Con le varianti il prezzo del prodotto e' quello della piu'
        // economica: e' il valore che si vedrebbe se le varianti sparissero.
        const base =
          voce.prezzo ?? Math.min(...(voce.varianti ?? []).map((v) => v.prezzo));

        // La foto, se c'e' gia' su disco, si riaggancia. Serve soprattutto in
        // produzione: le immagini viaggiano in git dentro public/uploads/<slug>/,
        // il legame fra prodotto e foto vive nel database e li' quel database
        // e' un altro. Senza questo, lanciare il seed sul server darebbe tre
        // menu completi e nemmeno una foto — e per riaverle bisognerebbe
        // ripagare Nano Banana da capo.
        //
        // Prima nella cartella del locale, poi in quella da cui si clona: il
        // prodotto identico di un altro locale ha gia' la sua foto, ed e' gia'
        // stata pagata una volta.
        const nomeFoto = `menu-${slugFoto(cat.nome)}-${slugFoto(voce.nome)}.webp`;
        let imageUrl: string | null = null;
        if (existsSync(path.join(uploads, locale.slug, nomeFoto))) {
          imageUrl = `/uploads/${locale.slug}/${nomeFoto}`;
          riagganciate++;
        } else if (locale.fotoDa) {
          const sorgente = path.join(uploads, locale.fotoDa, nomeFoto);
          if (existsSync(sorgente)) {
            const cartella = path.join(uploads, locale.slug);
            mkdirSync(cartella, { recursive: true });
            copyFileSync(sorgente, path.join(cartella, nomeFoto));
            imageUrl = `/uploads/${locale.slug}/${nomeFoto}`;
            copiate++;
          }
        }

        const prodotto = await db
          .insert(menuProducts)
          .values({
            tenantId,
            categoryId,
            name: voce.nome,
            description: voce.descrizione ?? null,
            allergens: voce.allergeni ?? [],
            priceCents: cents(base),
            imageUrl,
            pinned: !!voce.inCima,
            sortOrder: pi + 1,
          })
          .returning({ id: menuProducts.id });
        prodotti++;

        if (voce.varianti?.length) {
          await db.insert(menuProductVariants).values(
            voce.varianti.map((v, vi) => ({
              tenantId,
              productId: prodotto[0].id,
              name: v.nome,
              priceCents: cents(v.prezzo),
              sortOrder: vi + 1,
            }))
          );
          varianti += voce.varianti.length;
        }
      }
    }

    console.log(
      `${locale.nome} (${locale.slug}): ${creato.tables} tavoli, ` +
        `${locale.menu.length} categorie, ${prodotti} prodotti, ${varianti} formati` +
        (riagganciate ? `, ${riagganciate} foto riagganciate` : "") +
        (copiate ? `, ${copiate} foto copiate da ${locale.fotoDa}` : "") +
        (prodotti - riagganciate - copiate
          ? `, ${prodotti - riagganciate - copiate} senza foto`
          : "")
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
