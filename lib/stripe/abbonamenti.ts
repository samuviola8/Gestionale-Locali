import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantBilling } from "@/lib/db/schema";
import { getContratto } from "@/lib/billing/contratti";
import { stripe, stripeConfigurato } from "@/lib/stripe/client";
import { daQuandoAddebitare } from "@/lib/stripe/checkout";

// Toccare un abbonamento gia' aperto su Stripe.
//
// Sta a parte da checkout.ts, che apre: qui si cambia qualcosa a uno che
// esiste, ed e' il posto dove finiscono le decisioni prese di qua che devono
// arrivare di la'.

/**
 * La prova e' cambiata da noi: si dice anche a Stripe.
 *
 * Serve perche' allungare la prova dal pannello scriveva solo a database.
 * Un locale con la carta collegata ha su Stripe un abbonamento con la sua
 * data di primo addebito congelata: se gli si regalano altri trenta giorni e
 * a Stripe non lo si dice, Stripe addebita lo stesso alla data vecchia. Il
 * locale paga una prova che gli era stata promessa gratis, e a scoprirlo e'
 * lui.
 *
 * Torna una riga di testo su cosa e' successo: la scrive nei log chi chiama,
 * e in un allineamento fra due sistemi "non ho fatto niente perche' non c'era
 * un abbonamento" e "non sono riuscito" devono restare distinguibili.
 */
export async function allineaProvaSuStripe(tenantId: string): Promise<string> {
  const c = await getContratto(tenantId);
  if (!c?.providerSubscriptionId) {
    return "nessun abbonamento su Stripe: niente da allineare";
  }
  if (!stripeConfigurato()) {
    // Non si puo' allineare e non si puo' far finta: qui i due sistemi stanno
    // gia' dicendo cose diverse, e l'unica cosa utile e' lasciarlo scritto.
    return "ATTENZIONE: Stripe non e' configurato, l'abbonamento resta con la data vecchia";
  }

  // La stessa regola che decide da quando si addebita aprendo l'abbonamento.
  // `false` perche' un'attivazione una tantum si paga alla firma e qui la
  // firma e' gia' passata: non c'e' niente da incassare adesso.
  const { trial_end } = daQuandoAddebitare(c, false);

  if (!trial_end) {
    // La data nuova e' passata, o e' entro due giorni. Non si tocca niente di
    // proposito: mandare Stripe a fatturare adesso vorrebbe dire un addebito
    // a sorpresa partito da una correzione nel pannello, che e' il modo
    // peggiore di incassare. Chi vuole farlo pagare subito lo fa dal portale.
    return "prova gia' finita o troppo vicina: l'abbonamento non si tocca";
  }

  try {
    await stripe().subscriptions.update(c.providerSubscriptionId, {
      trial_end,
      // Niente conguagli: si sta spostando una data, non cambiando un prezzo.
      // Senza questo Stripe si mette a calcolare ratei su un periodo che non
      // e' mai stato fatturato.
      proration_behavior: "none",
    });
    const giorno = new Date(trial_end * 1000).toISOString().slice(0, 10);
    return `abbonamento ${c.providerSubscriptionId}: primo addebito spostato al ${giorno}`;
  } catch (e) {
    return `ATTENZIONE: non sono riuscito a spostare ${c.providerSubscriptionId} — ${(e as Error).message}`;
  }
}

/**
 * Il locale disdice. Vale a fine periodo, non adesso.
 *
 * Adesso sarebbe togliergli un servizio che ha gia' pagato: fino alla
 * scadenza continua a usarlo, e alla scadenza Stripe non rinnova. E' anche il
 * comportamento che il portale di Stripe ha gia' — qui c'e' perche' il
 * bottone deve stare dove il locale sta guardando, non dietro un altro sito.
 *
 * Fino alla scadenza si puo' tornare indietro: vedi `riattivaAbbonamento`.
 */
export async function disdiciAbbonamento(tenantId: string): Promise<string> {
  const c = await getContratto(tenantId);
  if (!c?.providerSubscriptionId) return "nessun abbonamento da disdire";
  if (!stripeConfigurato()) return "ATTENZIONE: Stripe non e' configurato";

  try {
    const sub = await stripe().subscriptions.update(c.providerSubscriptionId, {
      cancel_at_period_end: true,
    });
    // La data si scrive subito invece di aspettare l'avviso di Stripe: chi ha
    // appena premuto il bottone deve vedere l'effetto ricaricando la pagina,
    // non fra qualche secondo. Quando l'avviso arriva riscrive lo stesso
    // valore, e non fa danno.
    await segnaFine(tenantId, sub.cancel_at);
    return `abbonamento ${sub.id}: disdetto, finisce il ${giorno(sub.cancel_at)}`;
  } catch (e) {
    return `ATTENZIONE: non sono riuscito a disdire — ${(e as Error).message}`;
  }
}

/** Ci ha ripensato. Si puo' finche' il periodo non e' finito. */
export async function riattivaAbbonamento(tenantId: string): Promise<string> {
  const c = await getContratto(tenantId);
  if (!c?.providerSubscriptionId) return "nessun abbonamento da riattivare";
  if (!stripeConfigurato()) return "ATTENZIONE: Stripe non e' configurato";

  try {
    const sub = await stripe().subscriptions.update(c.providerSubscriptionId, {
      cancel_at_period_end: false,
    });
    await segnaFine(tenantId, null);
    return `abbonamento ${sub.id}: riattivato, il rinnovo riparte`;
  } catch (e) {
    return `ATTENZIONE: non sono riuscito a riattivare — ${(e as Error).message}`;
  }
}

/**
 * Il rapporto e' chiuso da noi: l'abbonamento si ferma **adesso**.
 *
 * Diverso dalla disdetta del locale, e la differenza non e' una finezza. Se
 * chiudo un contratto dal pannello e l'abbonamento resta aperto, Stripe
 * continua ad addebitare la carta di un cliente che per me non esiste piu':
 * sono soldi presi a torto, e me lo scrive lui.
 *
 * Si chiama da chi chiude il contratto. Non lo fa salvaContratto da solo
 * perche' contratti.ts non conosce Stripe — e non deve: e' Stripe che importa
 * il contratto per sapere cosa fatturare, e farsi importare a sua volta
 * sarebbe un giro chiuso.
 */
export async function chiudiAbbonamentoSuStripe(tenantId: string): Promise<string> {
  const c = await getContratto(tenantId);
  if (!c?.providerSubscriptionId) return "nessun abbonamento aperto";
  if (!stripeConfigurato()) {
    return "ATTENZIONE: Stripe non e' configurato, l'abbonamento resta aperto e continuera' ad addebitare";
  }

  try {
    await stripe().subscriptions.cancel(c.providerSubscriptionId);
    // Non si tocca il contratto: a staccarlo ci pensa il webhook, che riceve
    // customer.subscription.deleted da questa stessa chiamata. Scriverlo
    // anche qui vorrebbe dire due punti che scrivono la stessa colonna.
    return `abbonamento ${c.providerSubscriptionId}: chiuso, non addebitera' piu'`;
  } catch (e) {
    return `ATTENZIONE: non sono riuscito a chiuderlo — ${(e as Error).message}`;
  }
}

/** La data in cui l'abbonamento morira', o null se non ne ha una. */
export async function segnaFine(
  tenantId: string,
  quando: number | null
): Promise<void> {
  await db
    .update(tenantBilling)
    .set({
      providerCancelAt: quando ? new Date(quando * 1000) : null,
      updatedAt: new Date(),
    })
    .where(eq(tenantBilling.tenantId, tenantId));
}

function giorno(unix: number | null): string {
  return unix ? new Date(unix * 1000).toISOString().slice(0, 10) : "?";
}
