import Stripe from "stripe";

// Il client di Stripe, uno solo per processo.
//
// Vale la stessa regola di SMTP, di Telegram e dei dati dell'emittente: senza
// chiave la piattaforma non si rompe, si limita a non incassare con carta. Un
// progetto che pretende tutte le chiavi per accendersi non lo si prova mai, e
// la meta' delle pagine qui dentro con Stripe non c'entra niente.

const chiave = process.env.STRIPE_SECRET_KEY ?? "";

// Riusa lo stesso client tra gli hot-reload in sviluppo, come per Postgres:
// ogni istanza si porta dietro il suo pool di connessioni HTTP.
const globalForStripe = globalThis as unknown as { stripeClient?: Stripe };

/** C'e' una chiave. Da qui si decide se mostrare il bottone "paga con carta". */
export function stripeConfigurato(): boolean {
  return chiave.startsWith("sk_");
}

/**
 * Siamo in modalita' prova. Va scritto a schermo dove si incassa: un
 * abbonamento finto che sembra vero e' il modo piu' facile per convincersi di
 * aver preso dei soldi che non sono mai arrivati.
 */
export function stripeInProva(): boolean {
  return chiave.startsWith("sk_test_");
}

/**
 * Il client. Non si costruisce al caricamento del modulo e non si lancia
 * niente da li': importare questo file da una pagina che non incassa non deve
 * buttarla giu'. L'errore esce a chi Stripe lo chiama davvero, dove si sa cosa
 * si stava provando a fare.
 */
export function stripe(): Stripe {
  if (!stripeConfigurato()) {
    throw new Error(
      "STRIPE_SECRET_KEY non configurata: l'incasso con carta e' spento."
    );
  }
  const client =
    globalForStripe.stripeClient ??
    new Stripe(chiave, {
      // Il nome compare nei log di Stripe accanto a ogni chiamata. Quando fra
      // sei mesi ci sara' da capire chi ha creato un abbonamento storto,
      // "comanda" e' meglio di una riga vuota.
      appInfo: { name: "Comanda", url: "https://samuviola.dev" },
      // Due tentativi in piu' sui guasti di rete. Stripe li rende sicuri con
      // una chiave di idempotenza che mette da se': un retry non addebita due
      // volte.
      maxNetworkRetries: 2,
    });
  if (process.env.NODE_ENV !== "production") globalForStripe.stripeClient = client;
  return client;
}
