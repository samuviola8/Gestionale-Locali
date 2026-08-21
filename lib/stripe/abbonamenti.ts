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
