import { config } from "dotenv";

config({ path: ".env.local" });

// Crea su Stripe i prodotti di Comanda: un nome leggibile per ogni pacchetto
// e per ogni voce che puo' finire in fattura. I prezzi non passano di qui —
// li costruisce lib/stripe/catalogo.ts partendo dal contratto, e il perche' e'
// scritto la' dentro.
//
// Si rilancia quante volte si vuole: gli identificativi sono decisi da noi,
// quindi la seconda volta aggiorna invece di duplicare.
//
//   npx tsx scripts/stripe-catalogo.ts
//
// Guarda la chiave che trova in .env.local: con sk_test_ lavora sul catalogo
// di prova, con sk_live_ su quello vero. Il secondo caso lo dice e si ferma a
// chiedere conferma, perche' non e' una cosa da fare per sbaglio.

async function main() {
  const { stripe, stripeConfigurato, stripeInProva } = await import("@/lib/stripe/client");
  const { VOCI, nomeProdotto, pacchettiDaPubblicare, prodottoId } = await import(
    "@/lib/stripe/catalogo"
  );

  if (!stripeConfigurato()) {
    console.error(
      "STRIPE_SECRET_KEY manca in .env.local. Prendila da\n" +
        "https://dashboard.stripe.com/test/apikeys (modalita' prova accesa)."
    );
    process.exit(1);
  }

  if (!stripeInProva() && process.argv[2] !== "--produzione") {
    console.error(
      "La chiave e' di produzione. Se e' voluto rilancia con --produzione,\n" +
        "altrimenti metti in .env.local quella che comincia per sk_test_."
    );
    process.exit(1);
  }

  console.log(
    stripeInProva()
      ? "Catalogo di prova (sk_test).\n"
      : "CATALOGO DI PRODUZIONE.\n"
  );

  const client = stripe();
  let creati = 0;
  let aggiornati = 0;

  for (const pacco of pacchettiDaPubblicare()) {
    for (const voce of VOCI) {
      const id = prodottoId(pacco.key, voce);
      const name = nomeProdotto(pacco.label, voce);
      // Nel metadata ci va da cosa nasce il prodotto: chi apre la dashboard di
      // Stripe fra un anno non ha sotto mano lib/billing/listino.ts, e
      // "comanda_locale_assistenza" da solo non dice quale pacchetto sia.
      const metadata = { app: "comanda", pack: pacco.key, voce };

      const esistente = await client.products
        .retrieve(id)
        .catch((e: unknown) => {
          // Solo il "non c'e'" e' un caso normale. Una chiave sbagliata o un
          // guasto di rete devono fermare tutto, non farci creare un doppione.
          if (
            typeof e === "object" &&
            e !== null &&
            (e as { code?: string }).code === "resource_missing"
          ) {
            return null;
          }
          throw e;
        });

      if (esistente) {
        await client.products.update(id, { name, metadata, active: true });
        aggiornati++;
        console.log(`  ~ ${id}  ${name}`);
      } else {
        await client.products.create({ id, name, metadata });
        creati++;
        console.log(`  + ${id}  ${name}`);
      }
    }
  }

  console.log(`\n${creati} creati, ${aggiornati} aggiornati.`);
  console.log(
    stripeInProva()
      ? "Si vedono su https://dashboard.stripe.com/test/products"
      : "Si vedono su https://dashboard.stripe.com/products"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
