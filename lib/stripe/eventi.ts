import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { payments, tenantBilling } from "@/lib/db/schema";
import {
  agganciaProvider,
  attivaDaIncasso,
  getContratto,
  prossimaScadenza,
  type Periodo,
} from "@/lib/billing/contratti";
import { registraIncasso } from "@/lib/billing/documenti";

// Cosa fare quando Stripe ci racconta che e' successo qualcosa.
//
// Sta qui e non dentro la route perche' la route ha un lavoro solo: controllare
// che la firma sia buona. Quello che viene dopo si deve poter chiamare anche da
// scripts/prova-stripe.ts, senza doversi inventare una firma valida.
//
// Ogni funzione torna una riga di testo. Finisce nei log del server e nello
// script di prova, ed e' l'unico modo per capire, tre giorni dopo, perche' un
// incasso non e' comparso: "ignorato: nessun locale col cliente cus_xxx" e'
// una risposta, un ritorno vuoto no.

/** Gli eventi da spuntare su Stripe quando si crea il webhook. */
export const EVENTI_ASCOLTATI = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
] as const;

export async function gestisciEvento(evento: Stripe.Event): Promise<string> {
  switch (evento.type) {
    case "checkout.session.completed":
      return firmato(evento.data.object as Stripe.Checkout.Session);
    case "invoice.paid":
      return incassato(evento.data.object as Stripe.Invoice);
    case "invoice.payment_failed":
      return fallito(evento.data.object as Stripe.Invoice);
    case "customer.subscription.deleted":
      return disdetto(evento.data.object as Stripe.Subscription);
    default:
      // Non e' un errore: su Stripe si possono spuntare piu' eventi di quelli
      // che servono, e rispondere 200 a quelli che non ci interessano evita
      // che li riprovi per tre giorni.
      return `ignorato: ${evento.type} non e' fra quelli che ascoltiamo`;
  }
}

// Il locale ha finito di mettere la carta.
async function firmato(s: Stripe.Checkout.Session): Promise<string> {
  const tenantId = s.client_reference_id ?? s.metadata?.tenantId ?? null;
  if (!tenantId) return "ignorato: sessione senza tenantId";

  await agganciaProvider(tenantId, {
    provider: "stripe",
    customerId: idDi(s.customer),
    subscriptionId: idDi(s.subscription),
  });
  // Lo stato resta quello che era: chi era in prova ci resta fino al primo
  // addebito vero. Ad attivarlo ci pensa invoice.paid.
  return `locale ${tenantId}: abbonamento ${idDi(s.subscription)} agganciato`;
}

// Sono arrivati dei soldi.
async function incassato(f: Stripe.Invoice): Promise<string> {
  const clienteId = idDi(f.customer);
  if (!clienteId) return "ignorato: fattura senza cliente";
  if (!f.id) return "ignorato: fattura senza identificativo";

  const tenantId = await tenantDalCliente(clienteId);
  if (!tenantId) return `ignorato: nessun locale col cliente ${clienteId}`;

  // Stessa fattura raccontata due volte. Succede: Stripe riprova finche' non
  // gli si risponde 200, e una risposta persa per strada vale un secondo
  // avviso. Il vincolo unico su `provider_ref` e' la rete sotto; questo
  // controllo serve solo a rispondere una cosa sensata invece di un errore.
  const gia = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.providerRef, f.id))
    .limit(1);
  if (gia.length > 0) return `gia' incassata: ${f.id}`;

  // L'importo e' `amount_paid`, cioe' quello che il locale ha pagato. Non
  // quello che arriva sul conto.
  //
  // La differenza e' la commissione di Stripe, e la tentazione di segnare il
  // netto — "tanto quelli sono i soldi veri" — in regime forfettario e'
  // proprio l'errore da non fare: li' i ricavi si dichiarano al lordo, perche'
  // i costi non si deducono e ci pensa il coefficiente di redditivita'.
  // Segnare il netto vuol dire dichiarare meno di quanto si e' incassato, e
  // vedersi sotto la soglia degli 85.000 per finta.
  const lordoCents = f.amount_paid;
  if (lordoCents <= 0) return `ignorata: ${f.id} non ha incassato niente`;

  // La data e' quella in cui Stripe ha incassato, non adesso. Un avviso
  // riprovato per due giorni arriverebbe con la data sbagliata, e il
  // forfettario e' un regime per cassa: e' il giorno dell'incasso a decidere
  // in quale anno il ricavo va dichiarato. Fra il 30 dicembre e il 2 gennaio
  // la differenza e' un anno d'imposta.
  const quando = f.status_transitions?.paid_at
    ? new Date(f.status_transitions.paid_at * 1000)
    : new Date();

  await registraIncasso({
    tenantId,
    // Senza documento, e per ora e' giusto cosi': la fattura la emette Comanda
    // con la sua numerazione, e quasi mai nello stesso istante in cui Stripe
    // addebita. Lo schema lo prevede gia' — un incasso senza documento esiste,
    // si aggancia dopo — e agganciarlo qui a naso, cercando una fattura aperta
    // di importo simile, e' il genere di indovinello che prima o poi salda il
    // documento sbagliato.
    invoiceId: null,
    amountCents: lordoCents,
    method: "stripe",
    providerRef: f.id,
    paidAt: quando,
    notes: f.number ? `Stripe ${f.number}` : null,
  });

  // La prossima scadenza si conta con la funzione di casa invece di leggerla
  // dalla fattura di Stripe: e' gia' scritta, sa che chi firma il 31 gennaio
  // paga a fine febbraio, e soprattutto non cambia forma quando Stripe cambia
  // versione delle API.
  const c = await getContratto(tenantId);
  const period = (c?.model === "abbonamento" ? c.period : "mensile") as Periodo;
  await attivaDaIncasso(tenantId, prossimaScadenza(period, quando));

  return `locale ${tenantId}: incassati ${(lordoCents / 100).toFixed(2)} euro (${f.id})`;
}

// La carta e' stata rifiutata.
async function fallito(f: Stripe.Invoice): Promise<string> {
  const clienteId = idDi(f.customer);
  const tenantId = clienteId ? await tenantDalCliente(clienteId) : null;
  if (!tenantId) return "ignorato: nessun locale per questa fattura";

  // Non si sospende niente da qui, ed e' voluto. Stripe ritenta da solo per
  // giorni, e la prima carta rifiutata e' quasi sempre un plafond finito o una
  // carta scaduta, non un locale che non vuole pagare. Chi decide di spegnere
  // e' lib/billing/blocco.ts, che guarda le fatture scadute oltre la
  // tolleranza — una regola sola, in un posto solo. Qui si lascia detto.
  return `locale ${tenantId}: pagamento rifiutato su ${f.id ?? "?"}, Stripe riprovera'`;
}

// Il locale ha disdetto, o l'abbonamento e' morto dopo troppi tentativi.
async function disdetto(s: Stripe.Subscription): Promise<string> {
  const clienteId = idDi(s.customer);
  const tenantId = clienteId ? await tenantDalCliente(clienteId) : null;
  if (!tenantId) return "ignorato: nessun locale per questo abbonamento";

  // Si stacca l'abbonamento e si tiene il cliente: e' lo stesso a cui si
  // rivende domani, e rifarlo da capo vorrebbe dire perdere le sue ricevute.
  //
  // Il contratto non si chiude qui. Chiudere un rapporto e' una decisione
  // commerciale — c'e' un preavviso, magari c'e' un arretrato da incassare lo
  // stesso — e l'ultima cosa che serve e' che sparisca dal pannello da solo,
  // di notte, senza che nessuno l'abbia deciso.
  await agganciaProvider(tenantId, { provider: "manuale", subscriptionId: null });
  return `locale ${tenantId}: abbonamento ${s.id} disdetto, contratto da chiudere a mano`;
}

// Il locale a cui appartiene un cliente di Stripe.
//
// Si passa da qui e non dal campo `subscription` della fattura perche' quel
// campo ha gia' cambiato posto fra due versioni delle API, mentre il cliente
// sulla fattura c'e' sempre stato e sempre nello stesso posto.
async function tenantDalCliente(customerId: string): Promise<string | null> {
  const rows = await db
    .select({ tenantId: tenantBilling.tenantId })
    .from(tenantBilling)
    .where(eq(tenantBilling.providerCustomerId, customerId))
    .limit(1);
  return rows[0]?.tenantId ?? null;
}

// Stripe manda l'identificativo o l'oggetto intero, a seconda di cosa gli si
// e' chiesto di espandere. Chi chiama vuole sempre e solo la stringa.
function idDi(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}
