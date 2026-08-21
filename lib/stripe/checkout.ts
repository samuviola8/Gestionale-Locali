import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantBilling, tenants } from "@/lib/db/schema";
import { getContratto, type Contratto } from "@/lib/billing/contratti";
import { stripe } from "@/lib/stripe/client";
import { righeDelContratto } from "@/lib/stripe/catalogo";

// Aprire un abbonamento: il cliente su Stripe, la sessione di pagamento, il
// portale dove il locale si cambia la carta da solo.
//
// La pagina di pagamento e' quella ospitata da Stripe, non una nostra. Non e'
// pigrizia: la carta non passa mai dai nostri server, quindi la conformita'
// PCI si riduce al questionario piu' corto, e SCA, 3-D Secure, Apple Pay e i
// tentativi di rinnovo falliti li gestisce Stripe. Sono le tre cose che
// costano piu' tempo di tutto il resto messo insieme.

/**
 * Il cliente di questo locale su Stripe, creato la prima volta e poi riusato.
 *
 * L'identificativo si scrive subito sul contratto: se il locale abbandona il
 * pagamento a meta' e ci riprova domani, deve ritrovare lo stesso cliente. Con
 * due clienti per lo stesso locale ci si accorge del guaio solo dopo, davanti
 * a due abbonamenti attivi sulla stessa insegna.
 */
export async function clienteStripe(tenantId: string): Promise<string> {
  const contratto = await getContratto(tenantId);
  if (contratto?.providerCustomerId) return contratto.providerCustomerId;

  const rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const locale = rows[0];
  if (!locale) throw new Error(`Locale ${tenantId} non trovato.`);

  const cliente = await stripe().customers.create(
    {
      // La ragione sociale se c'e', altrimenti l'insegna: su una ricevuta
      // "Bar Centrale di Rossi Mario" vale piu' di "Noya".
      name: locale.legalName || locale.name,
      // Dove arrivano i documenti, che spesso non e' la mail di chi lavora in
      // sala. Stessa precedenza della fatturazione.
      email: locale.billingEmail || locale.contactEmail || undefined,
      metadata: {
        app: "comanda",
        // Il tenantId e' il filo che riporta a casa ogni evento che Stripe ci
        // rimandera' indietro. Senza, dal webhook si sa che qualcuno ha
        // pagato ma non chi.
        tenantId,
        slug: locale.slug,
      },
      // La partita IVA sul cliente serve a Stripe per scriverla sulle sue
      // ricevute. Non sostituisce la nostra fattura: quella la emette Comanda,
      // con la sua numerazione.
      ...(locale.vatNumber
        ? { tax_id_data: [{ type: "eu_vat" as const, value: `IT${locale.vatNumber}` }] }
        : {}),
    },
    // Se la chiamata parte due volte — un doppio clic, un retry di rete — la
    // seconda torna il cliente della prima invece di crearne un altro.
    { idempotencyKey: `comanda-customer-${tenantId}` }
  );

  await db
    .update(tenantBilling)
    .set({ providerCustomerId: cliente.id, updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, tenantId));

  return cliente.id;
}

/**
 * La pagina dove il locale mette la carta e apre l'abbonamento. Torna l'URL a
 * cui mandarlo.
 */
export async function creaSessioneAbbonamento(
  tenantId: string,
  urls: { successUrl: string; cancelUrl: string }
): Promise<string> {
  const contratto = await getContratto(tenantId);
  if (!contratto) {
    throw new Error("Il locale non ha un contratto: non c'e' niente da pagare.");
  }
  if (contratto.providerSubscriptionId) {
    throw new Error(
      "Questo locale ha gia' un abbonamento aperto. Per cambiare carta si usa il portale."
    );
  }

  const line_items = righeDelContratto(contratto);
  if (!line_items) {
    throw new Error(
      "Il contratto non ha importi da addebitare: controlla canone e attivazione."
    );
  }

  const customer = await clienteStripe(tenantId);
  // Se fra le righe ce n'e' una senza `recurring`, e' l'attivazione: va
  // incassata adesso, e allora non si rimanda niente. Si ricava da quello che
  // si sta per mandare invece di ricalcolarlo: due conti sulla stessa cosa
  // prima o poi si contraddicono.
  const conUnaTantum = line_items.some((r) => !r.price_data?.recurring);

  const sessione = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items,
    locale: "it",
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    // Il filo verso casa, ripetuto in tre posti perche' i tre eventi che
    // ascoltiamo nel webhook non portano tutti le stesse informazioni: la
    // sessione ha `client_reference_id`, la fattura del rinnovo vede solo i
    // metadata della sottoscrizione.
    client_reference_id: tenantId,
    metadata: { app: "comanda", tenantId },
    subscription_data: {
      metadata: {
        app: "comanda",
        tenantId,
        pack: contratto.pack,
        model: contratto.model,
        period: contratto.period,
      },
      ...daQuandoAddebitare(contratto, conUnaTantum),
    },
  });

  if (!sessione.url) throw new Error("Stripe non ha restituito l'indirizzo di pagamento.");
  return sessione.url;
}

/**
 * Il portale di Stripe: il locale si cambia la carta, scarica le ricevute,
 * disdice. Sono tre pagine che non ha senso riscrivere, e disdire da soli e'
 * anche quello che chiede la legge sui rinnovi automatici.
 */
export async function urlPortale(tenantId: string, returnUrl: string): Promise<string> {
  const customer = await clienteStripe(tenantId);
  const sessione = await stripe().billingPortal.sessions.create({
    customer,
    return_url: returnUrl,
    locale: "it",
  });
  return sessione.url;
}

/**
 * Da quando Stripe comincia ad addebitare.
 *
 * Non e' un periodo di prova regalato: e' il periodo che il locale ha **gia'
 * coperto**, e che quindi non gli si puo' far pagare di nuovo. Chi e' in prova
 * l'ha coperto fino alla fine della prova; chi e' attivo fino alla prossima
 * scadenza — e' esattamente cosa vuol dire `next_invoice_at`, "la prossima
 * scadenza da fatturare".
 *
 * Guardare solo lo stato "prova" era il modo per incassare due volte lo stesso
 * mese: un locale attivo che collega la carta il 21 agosto, con la scadenza al
 * 20 settembre, si vedrebbe addebitare subito un mese che ha gia' pagato. Se
 * ne accorge lui prima di me, e ha ragione lui.
 *
 * Stripe chiama questo campo `trial_end` perche' dal suo punto di vista e' il
 * giorno in cui comincia a fatturare: e' lo stesso che si usa per portargli
 * dentro abbonamenti che prima vivevano da un'altra parte.
 */
export function daQuandoAddebitare(
  c: Pick<Contratto, "status" | "trialEndsAt" | "nextInvoiceAt">,
  /** C'e' una riga una tantum da incassare adesso (l'attivazione di un impianto). */
  conUnaTantum: boolean,
  adesso: Date = new Date()
): { trial_end?: number } {
  // L'attivazione non aspetta: e' il motivo per cui si firma un impianto, e
  // con la fatturazione rimandata slitterebbe anche lei.
  if (conUnaTantum) return {};

  const coperto =
    c.status === "prova"
      ? c.trialEndsAt
      : c.status === "attivo"
        ? c.nextInvoiceAt
        : // Sospeso o chiuso: non ha coperto niente, semmai deve un arretrato.
          // Chi torna a pagare dopo essere stato spento paga da subito.
          null;
  if (!coperto) return {};

  const secondi = Math.floor(coperto.getTime() / 1000);
  // Stripe non accetta una fatturazione che parte fra meno di due giorni.
  // Sotto quella soglia si comincia adesso, che e' anche quello che si aspetta
  // chi collega la carta il giorno della scadenza.
  const minimo = Math.floor(adesso.getTime() / 1000) + 48 * 3600;
  return secondi > minimo ? { trial_end: secondi } : {};
}
