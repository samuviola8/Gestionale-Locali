import { config } from "dotenv";

config({ path: ".env.local" });

// Crea il tenant Noya Lounge Bar usando esattamente la stessa funzione del
// wizard di /admin: se questo script funziona, funziona anche la UI.
//
//   npx tsx scripts/seed-noya.ts
//
// La password del titolare arriva da NOYA_OWNER_PASSWORD, cosi' non finisce
// scritta nel repository.

async function main() {
  // Import dinamico: il client del database legge DATABASE_URL appena viene
  // caricato, quindi deve avvenire dopo config().
  const { createLocaleWithSetup } = await import("@/lib/onboarding");

  const password = process.env.NOYA_OWNER_PASSWORD;
  if (!password) {
    console.error(
      "Manca NOYA_OWNER_PASSWORD. Esempio:\n" +
        '  $env:NOYA_OWNER_PASSWORD="..."; npx tsx scripts/seed-noya.ts'
    );
    process.exit(1);
  }

  const result = await createLocaleWithSetup({
    name: "Noya Lounge Bar",
    slug: "noya-lounge",
    profile: "lounge",

    legalName: "Noya Lounge S.r.l.s.",
    address: "Via Antonino di Sangiuliano 40/A",
    city: "Sant'Agata li Battiati",
    province: "CT",
    postalCode: "95030",
    notes:
      "Lounge bar serale con cucina, musica dal vivo. Format ricorrenti: cena " +
      "spettacolo il giovedi, evento domenicale GiraNoya. Anche feste private. " +
      "Menu reale, logo e planimetria tavoli ancora da ricevere dal locale.",

    // Tema scuro: il locale ha luci soffuse, lo schermo deve restare leggibile.
    // I colori restano quelli del preset finche' non arriva il logo vero.
    themePreset: "lounge",
    defaultTheme: "dark",

    // Moduli: attivi quelli che risolvono attesa e conto; gli add-on restano
    // predisposti ma spenti finche' il locale non li sottoscrive.
    modules: {
      qr_ordering: true,
      split_bill: true,
      waiter_call: true,
      payments: false,
      ai_suggestions: false,
      loyalty: false,
    },

    // Numero tavoli non ancora confermato: se ne creano 12 per la demo.
    tableCount: 12,
    tableSessionMinutes: 120,

    ownerEmail: "info@noyalounge.it",
    ownerPassword: password,
  });

  if (!result.ok) {
    console.error("Creazione fallita:", result.error);
    process.exit(1);
  }

  console.log("Tenant creato:", result.slug);
  console.log("  tavoli creati:   ", result.tables);
  console.log("  categorie menu:  ", result.categories, "(vuote, in attesa del menu reale)");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
