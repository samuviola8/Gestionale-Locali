import { config } from "dotenv";

config({ path: ".env.local" });

// Menu reale di Noya Lounge Bar, trascritto dai tre PDF pubblicati sul loro
// sito (noyalounge.it/menu/{drink,food,special}.pdf, scaricati il 10/08/2026).
//
//   npx tsx scripts/import-noya-menu.ts
//
// Rilanciarlo ricarica il menu da zero (cancella categorie e prodotti del
// tenant). I prezzi vanno RICONFERMATI col locale prima del go-live: quelli
// dei PDF possono essere piu' vecchi del listino in sala.

type Item = {
  name: string;
  description?: string;
  price?: number; // euro; assente se il prodotto ha varianti
  variants?: { name: string; price: number }[];
  allergens?: string[];
};

type Category = { name: string; note?: string; items: Item[] };

// Distillati venduti a porzione e a shot: stessa forma, prezzi diversi.
function ps(name: string, porzione: number, shot: number): Item {
  return {
    name,
    variants: [
      { name: "Porzione", price: porzione },
      { name: "Shot", price: shot },
    ],
  };
}

const CATEGORIES: Category[] = [
  {
    name: "Signature",
    note: "I cocktail della casa.",
    items: [
      {
        name: "Rose St-Germain",
        description: "St-Germain, menta e velluto al bergamotto",
        price: 14,
      },
      {
        name: "Spritz Passion",
        description:
          "Sciroppo al passion fruit, Aperol, Prosecco e top di ginger beer",
        price: 14,
        allergens: ["Solfiti"],
      },
      {
        name: "Peach Gin Fizz",
        description: "Gin infuso alla pesca, cordiale al lime e top soda al pompelmo",
        price: 14,
      },
      {
        name: "Basil Gin Sour",
        description: "Basilico, lime, gin e sciroppo di zucchero",
        price: 14,
      },
      {
        name: "Red Berry Vodka",
        description: "Vodka ai frutti rossi, vermouth bianco e succo di lime",
        price: 14,
        allergens: ["Solfiti"],
      },
      {
        name: "Coffee Velvet",
        description:
          "Caffe, Kahlua, vodka, sciroppo di zucchero e top di velluto alle mandorle",
        price: 14,
        allergens: ["Frutta a guscio"],
      },
    ],
  },
  {
    name: "IBA Selection",
    note: "Selezione di cocktail, storici e non, consigliata dallo staff. È possibile ordinare drink internazionali fuori menu.",
    items: [
      { name: "Boulevardier", description: "Whisky, vermouth rosso, Campari", price: 12 },
      {
        name: "Chartreuse Swizzle",
        description: "Chartreuse Verde, succo d'ananas, succo di lime, Falernum",
        price: 12,
      },
      {
        name: "Don's Special Daiquiri",
        description:
          "Rum chiaro, rum scuro, passion fruit, succo di lime, sciroppo di miele",
        price: 12,
      },
      {
        name: "Missionary's Downfall",
        description:
          "Rum chiaro, Peach Brandy, succo di lime, honey mix, foglie di menta",
        price: 12,
      },
      {
        name: "Naked and Famous",
        description: "Mezcal, Aperol, Chartreuse Gialla, succo di lime",
        price: 12,
      },
      { name: "Negroni", description: "Gin, vermouth rosso, Campari", price: 12 },
      {
        name: "Old Fashioned",
        description: "Bourbon whiskey, zolletta di zucchero, dash angostura, dash soda",
        price: 12,
      },
      { name: "Sidecar", description: "Cognac, Cointreau, succo di lime", price: 12 },
      {
        name: "Paloma",
        description: "Tequila, succo di lime, sale, soda al pompelmo rosa",
        price: 12,
      },
    ],
  },
  {
    name: "Spritz",
    items: [
      { name: "Aperol Spritz", description: "Prosecco, Aperol, soda", price: 12, allergens: ["Solfiti"] },
      { name: "Campari Spritz", description: "Prosecco, bitter Campari, soda", price: 12, allergens: ["Solfiti"] },
      {
        name: "Hugo Spritz",
        description: "Prosecco, St. Germain, succo di lime, menta, soda",
        price: 12,
        allergens: ["Solfiti"],
      },
      { name: "Sarti Rosa Spritz", description: "Prosecco, Sarti Rosa, soda", price: 12, allergens: ["Solfiti"] },
      { name: "Limoncello Spritz", description: "Prosecco, limoncello, soda", price: 12, allergens: ["Solfiti"] },
    ],
  },
  {
    name: "Gin",
    items: [
      { name: "Bulldog", variants: [{ name: "Base", price: 12 }] },
      { name: "Tamashi", variants: [{ name: "Base", price: 12 }] },
      { name: "Tamashi Premium", variants: [{ name: "Premium", price: 15 }] },
      { name: "Elephant", variants: [{ name: "Premium", price: 15 }] },
      { name: "Hendrick's", variants: [{ name: "Premium", price: 15 }] },
      { name: "Midsummer", variants: [{ name: "Premium", price: 15 }] },
      { name: "Gran Cabaret", variants: [{ name: "Premium", price: 15 }] },
      { name: "Lunar", variants: [{ name: "Premium", price: 15 }] },
      { name: "Saigon Baigur", variants: [{ name: "Premium", price: 15 }] },
      { name: "Etsu Sakura", variants: [{ name: "Premium", price: 15 }] },
      { name: "Etsu", variants: [{ name: "Premium", price: 15 }] },
      { name: "Nikka Gin", variants: [{ name: "Premium", price: 15 }] },
      { name: "Nordes", variants: [{ name: "Premium", price: 15 }] },
      { name: "N3", variants: [{ name: "Premium", price: 15 }] },
      { name: "Professore Madame", variants: [{ name: "Premium", price: 15 }] },
      { name: "Portofino", variants: [{ name: "Premium", price: 15 }] },
      { name: "Ondina", variants: [{ name: "Premium", price: 15 }] },
      { name: "Sabatini", variants: [{ name: "Premium", price: 15 }] },
      { name: "Alkemist", variants: [{ name: "Premium", price: 15 }] },
      { name: "Monkey 47", variants: [{ name: "Premium", price: 15 }] },
    ],
  },
  {
    name: "Rum",
    items: [
      ps("Diplomatico", 9, 4),
      ps("Zacapa 23", 10, 5),
      ps("Don Papa Baroko", 10, 5),
      ps("J. Bally Agricole", 9, 4),
      ps("Kingstone Scuro", 8, 3),
      ps("Kingstone Chiaro", 8, 3),
      ps("Abuelo XII", 10, 5),
      ps("Appleton", 9, 4),
    ],
  },
  {
    name: "Whiskey",
    items: [
      ps("Wild Turkey Bourbon", 8, 3),
      ps("Wild Turkey Rye", 8, 3),
      ps("Wild Turkey 101", 9, 4),
      ps("Bushmills", 8, 3),
      ps("Talisker", 9, 4),
      ps("Oban", 12, 7),
      ps("Laphroaig", 9, 4),
      ps("Jameson", 9, 4),
      ps("Jameson Black Barrell", 9, 4),
      ps("Red Label", 8, 3),
      ps("Nikka Whiskey", 10, 5),
    ],
  },
  {
    name: "Vodka",
    items: [
      { name: "Ketel One", variants: [{ name: "Drink", price: 15 }] },
      { name: "Belvedere", variants: [{ name: "Drink", price: 15 }] },
      { name: "Grey Goose", variants: [{ name: "Drink", price: 15 }] },
      { name: "Beluga", variants: [{ name: "Drink", price: 15 }] },
      { name: "Skyy", variants: [{ name: "Drink", price: 12 }] },
    ],
  },
  {
    name: "Tequila e Mezcal",
    items: [
      ps("Espolon Blanco", 8, 3),
      ps("Espolon Anejo", 8, 3),
      ps("Espolon Reposado", 8, 3),
      ps("Montebolos Mezcal", 8, 3),
    ],
  },
  {
    name: "Vermouth",
    items: [
      ps("Cinzano Bottega 1757", 8, 3),
      ps("Carpano", 8, 3),
      ps("Punt e Mes", 8, 3),
      ps("Antica Formula", 9, 4),
      ps("Vermouth del Professore Rosso", 9, 4),
      ps("Vermouth del Professore Bianco", 9, 4),
      ps("Martini Bianco Extra Dry", 8, 3),
    ],
  },
  {
    name: "Amari",
    items: [
      ps("Amaro del Capo", 5, 3),
      ps("Jagermeister", 5, 3),
      ps("Unicum", 5, 3),
      ps("Montenegro", 5, 3),
      ps("Amaro Amara", 5, 3),
      ps("Jefferson", 6, 4),
    ],
  },
  {
    name: "Liquori e after dinner",
    items: [
      ps("Passito", 5, 3),
      ps("Cognac Courvoisier", 5, 3),
      ps("Kahlua", 5, 3),
      ps("Liquore al cioccolato", 5, 3),
      ps("Frangelico", 5, 3),
      ps("Drambuie", 5, 3),
      ps("Grappa Bianca 18Lune", 5, 3),
      ps("Grappa Barricata 18Lune", 5, 3),
      ps("Pisco Barsol", 5, 3),
      ps("Liquore Pesca Etna", 5, 3),
      ps("Cachaça Sagatiba", 5, 3),
      ps("Saint Germain", 8, 3),
      ps("Campari Bitter", 8, 3),
      ps("Disaronno", 5, 3),
      ps("Liquore Amarena Ratafia", 8, 3),
    ],
  },
  {
    name: "Birre",
    items: [
      { name: "24 Baroni alla spina", variants: [{ name: "Rossa", price: 6 }, { name: "Bionda", price: 6 }], allergens: ["Glutine"] },
      { name: "24 Baroni in bottiglia", description: "Assortite", price: 4, allergens: ["Glutine"] },
    ],
  },
  {
    name: "Soft drink",
    items: [
      { name: "Lemon Schweppes", price: 4 },
      { name: "Tonica Schweppes", price: 4 },
      { name: "Coca Cola", price: 4 },
      { name: "Coca Cola Zero", price: 4 },
      { name: "Soda pompelmo Thomas Henry", price: 5 },
      { name: "Soda Schweppes", price: 4 },
      { name: "Indiana Fever Tree", price: 5 },
      { name: "Mediterranea Fever Tree", price: 5 },
      { name: "Ginger Beer Thomas Henry", price: 5 },
      { name: "Ginger Ale Thomas Henry", price: 5 },
      { name: "Perrier frizzante", description: "33 cl", price: 4 },
      {
        name: "Acqua naturale",
        variants: [
          { name: "50 cl", price: 3 },
          { name: "75 cl", price: 3.5 },
        ],
      },
      { name: "Acqua frizzante", description: "75 cl", price: 3.5 },
      { name: "Acqua effervescente", description: "75 cl", price: 3.5 },
    ],
  },
  {
    name: "Food",
    note: "Menu estivo. Coperto € 2,00.",
    items: [
      { name: "Patata fresca stick", description: "500 g", price: 5 },
      {
        name: "Noya Crunch Chicken",
        description:
          "Pollo marinato avvolto da una croccante panatura dorata, servito con mayo homemade. Prodotto surgelato",
        price: 7,
        allergens: ["Glutine", "Uova"],
      },
      {
        name: "Gamberi in tempura homemade",
        description: "5 pezzi",
        price: 10,
        allergens: ["Crostacei", "Glutine"],
      },
      {
        name: "Focaccia pugliese",
        description: "Stracciatella vaccina, datterino condito, crudo Fiocco della Valtellina",
        price: 14,
        allergens: ["Glutine", "Latte"],
      },
      {
        name: "Tartare di tonno",
        description:
          "80 g, servita con stracciatella vaccina, salsa al basilico e pomodoro confit. Prodotto surgelato",
        price: 14,
        allergens: ["Pesce", "Latte"],
      },
      {
        name: "Avocado toast-beef",
        description:
          "2 pezzi. Focaccia farcita con guacamole, fesa di manzo affumicata, salsa alla senape e miele e maionese al rafano",
        price: 13,
        allergens: ["Glutine", "Uova", "Senape"],
      },
      {
        name: "Noya Smash",
        description:
          "Burger 100 g, pomodoro, lattuga, formaggio, cetriolini e salsa burger, accompagnato dalle nostre patatine fresche",
        price: 14,
        allergens: ["Glutine", "Latte", "Uova"],
      },
      {
        name: "Filetto di maialino in CBT grigliato",
        description:
          "200 g, accompagnato da un'insalatina di cavolo rosso marinata all'aceto di lamponi e salsa alla senape e miele",
        price: 15,
        allergens: ["Senape", "Solfiti"],
      },
      {
        name: "Pane cunzato misto",
        description:
          "Tonno all'olio EVO, datterino, mozzarella fior di latte, pomodori secchi, filetti di melanzane sott'olio, olive taggiasche e cucunci",
        price: 13,
        allergens: ["Glutine", "Latte", "Pesce"],
      },
      { name: "Dolce del giorno", price: 6 },
    ],
  },
  {
    name: "Vini bianchi",
    items: [
      { name: "Baglio Oro — Ammari Frizzante", price: 20, allergens: ["Solfiti"] },
      { name: "Baglio Oro — Kiggiari Grecanico", price: 20, allergens: ["Solfiti"] },
      { name: "Baglio Oro — Ceppibianchi Zibibbo", price: 20, allergens: ["Solfiti"] },
      { name: "Feudo Montoni — Inzolia", price: 25, allergens: ["Solfiti"] },
      { name: "Feudo Montoni — Grillo", price: 25, allergens: ["Solfiti"] },
      { name: "Cantine Fina — Kikè", price: 25, allergens: ["Solfiti"] },
      { name: "Firriato — Charme Frizzante", price: 25, allergens: ["Solfiti"] },
      { name: "Firriato — Shamaris Grillo", price: 25, allergens: ["Solfiti"] },
      {
        name: "Firriato — Angimbè",
        description: "Sauvignon Blanc & Chardonnay",
        price: 25,
        allergens: ["Solfiti"],
      },
      { name: "Rio Favara — Mizzica Moscato Bianco", price: 30, allergens: ["Solfiti"] },
      { name: "Pietradolce — Etna Bianco", price: 35, allergens: ["Solfiti"] },
    ],
  },
  {
    name: "Vini rossi e rosati",
    items: [
      { name: "Baglio Oro — Donsar Syrah", price: 30, allergens: ["Solfiti"] },
      { name: "Cusumano — Disueri Nero d'Avola", price: 30, allergens: ["Solfiti"] },
      { name: "Feudo Montoni — Perricone", price: 35, allergens: ["Solfiti"] },
      { name: "Pietradolce — Etna Rosso", price: 35, allergens: ["Solfiti"] },
      { name: "Pietradolce — Etna Rosato", price: 35, allergens: ["Solfiti"] },
    ],
  },
  {
    name: "Bollicine e Champagne",
    items: [
      { name: "Maschio dei Cavalieri — Shamat", price: 25, allergens: ["Solfiti"] },
      { name: "Baglio Oro — Truscè Spumante Brut", price: 20, allergens: ["Solfiti"] },
      { name: "Biancavigna — Prosecco DOCG Brut", price: 20, allergens: ["Solfiti"] },
      { name: "Derbusco Cives — Franciacorta Brut", price: 40, allergens: ["Solfiti"] },
      { name: "Toblino — Vènt Trento DOC", price: 40, allergens: ["Solfiti"] },
      { name: "Cusumano — 700 Metodo Classico Sicilia", price: 35, allergens: ["Solfiti"] },
      { name: "Champagne Mandois — Brut Origine", price: 60, allergens: ["Solfiti"] },
      { name: "Champagne Mandois — Brut Rosé Origine", price: 65, allergens: ["Solfiti"] },
      { name: "Champagne Bruno Paillard — Première Cuvée", price: 75, allergens: ["Solfiti"] },
    ],
  },
];

function cents(euro: number): number {
  return Math.round(euro * 100);
}

async function main() {
  const { db } = await import("@/lib/db");
  const { tenants, menuCategories, menuProducts, menuProductVariants } =
    await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const tenant = (
    await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, "noya-lounge"))
      .limit(1)
  )[0];

  if (!tenant) {
    console.error("Tenant 'noya-lounge' non trovato. Lancia prima seed-noya.ts.");
    process.exit(1);
  }

  // Ricarica pulita: le varianti e i prodotti cadono in cascata con le categorie.
  await db.delete(menuCategories).where(eq(menuCategories.tenantId, tenant.id));

  let products = 0;
  let variants = 0;

  for (const [ci, cat] of CATEGORIES.entries()) {
    const inserted = await db
      .insert(menuCategories)
      .values({ tenantId: tenant.id, name: cat.name, sortOrder: ci + 1 })
      .returning({ id: menuCategories.id });
    const categoryId = inserted[0].id;

    for (const [pi, item] of cat.items.entries()) {
      // Un prodotto con varianti tiene come price_cents la variante piu'
      // economica: e' il valore mostrato se le varianti sparissero.
      const base =
        item.price ?? Math.min(...(item.variants ?? []).map((v) => v.price));

      const prod = await db
        .insert(menuProducts)
        .values({
          tenantId: tenant.id,
          categoryId,
          name: item.name,
          description: item.description ?? null,
          allergens: item.allergens ?? [],
          priceCents: cents(base),
          sortOrder: pi + 1,
        })
        .returning({ id: menuProducts.id });
      products++;

      if (item.variants?.length) {
        await db.insert(menuProductVariants).values(
          item.variants.map((v, vi) => ({
            tenantId: tenant.id,
            productId: prod[0].id,
            name: v.name,
            priceCents: cents(v.price),
            sortOrder: vi + 1,
          }))
        );
        variants += item.variants.length;
      }
    }
  }

  console.log(
    `Menu importato: ${CATEGORIES.length} categorie, ${products} prodotti, ${variants} formati.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
