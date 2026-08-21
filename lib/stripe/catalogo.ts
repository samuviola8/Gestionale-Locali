import type Stripe from "stripe";
import { PACCHETTI, type Pacco } from "@/lib/billing/listino";
import type { Contratto, ModelloContratto, Periodo } from "@/lib/billing/contratti";

// Il ponte fra il listino di Comanda e il catalogo di Stripe.
//
// La decisione che regge tutto il file: **a Stripe si mandano i prodotti, non
// i prezzi**. I prodotti sono nomi — "Comanda Pro — Abbonamento" — e servono
// perche' sulla ricevuta e nella dashboard di Stripe si legga qualcosa di
// sensato invece di un identificativo. Il prezzo invece parte ogni volta dal
// contratto a database (`recurringCents`, `activationCents`), costruito al
// volo come `price_data`.
//
// Il motivo e' che il contratto e' gia' la fonte di verita' del progetto: e'
// scritto in lib/billing/listino.ts che il listino puo' cambiare mentre chi ha
// gia' firmato continua a pagare quello che aveva accettato, e in schema.ts
// che `recurring_cents` e' "quanto si paga a ogni scadenza, chi legge questa
// riga non deve rifare il conto". Se accanto ci mettessi dei Price di listino
// su Stripe avrei due numeri per la stessa cosa, e prima o poi divergono: il
// prezzo fondatori, lo scostamento per singolo locale in `billing_prices`, il
// pacchetto su misura — nessuno dei tre sta in un listino. Il giorno che
// divergono il locale paga la cifra sbagliata e non se ne accorge nessuno,
// perche' il pannello continua a mostrare quella giusta.
//
// Costa un Price usa-e-getta per ogni abbonamento aperto. Stripe li raggruppa
// sotto il prodotto e non si paga per averli: e' il prezzo giusto per non
// avere mai due listini da tenere allineati a mano.

/** Cosa si sta pagando. Sono le voci che finiscono in fattura. */
export type VoceCatalogo = "abbonamento" | "assistenza" | "attivazione";

/**
 * L'id del prodotto su Stripe. Lo scelgo io invece di lasciarlo generare:
 * cosi' il seed si puo' rilanciare all'infinito senza duplicare niente, ed e'
 * lo stesso identificativo in prova e in produzione.
 */
export function prodottoId(pack: string, voce: VoceCatalogo): string {
  return `comanda_${pack}_${voce}`;
}

/** I pacchetti che vanno su Stripe, col su misura in coda. */
export function pacchettiDaPubblicare(): { key: string; label: string }[] {
  return [
    ...PACCHETTI.map((p: Pacco) => ({ key: p.key, label: p.label })),
    // Il su misura non ha un prezzo di listino — per definizione — ma il
    // prodotto gli serve lo stesso: senza, l'abbonamento di un locale su
    // misura non avrebbe un nome da mettere in ricevuta.
    { key: "su_misura", label: "Su misura" },
  ];
}

export function nomeProdotto(label: string, voce: VoceCatalogo): string {
  const coda =
    voce === "abbonamento"
      ? "Abbonamento"
      : voce === "assistenza"
        ? "Assistenza"
        : "Attivazione";
  return `Comanda ${label} — ${coda}`;
}

export const VOCI: VoceCatalogo[] = ["abbonamento", "assistenza", "attivazione"];

/**
 * Ogni quanto si rinnova, nel vocabolario di Stripe.
 *
 * Sull'impianto non si guarda `period`: lo schema dice che l'assistenza e'
 * sempre mensile, e un impianto salvato per sbaglio con period "annuale"
 * addebiterebbe l'assistenza una volta l'anno.
 */
export function intervallo(
  model: ModelloContratto,
  period: Periodo
): Stripe.PriceCreateParams.Recurring.Interval {
  if (model === "impianto") return "month";
  return period === "annuale" ? "year" : "month";
}

/** La voce ricorrente e quella una tantum di un contratto. */
export function vociDelContratto(model: ModelloContratto): {
  ricorrente: VoceCatalogo;
  unaTantum: VoceCatalogo | null;
} {
  return model === "impianto"
    ? { ricorrente: "assistenza", unaTantum: "attivazione" }
    : { ricorrente: "abbonamento", unaTantum: null };
}

/**
 * Le righe da mandare a Checkout, prezzi compresi, ricavate dal contratto.
 *
 * Torna null quando non c'e' niente da addebitare: canone a zero e nessuna
 * attivazione. Capita — un locale omaggio, un pilota — e aprire un
 * abbonamento da zero euro su Stripe non serve a nessuno.
 */
export function righeDelContratto(c: Contratto): Stripe.Checkout.SessionCreateParams.LineItem[] | null {
  const model = c.model as ModelloContratto;
  const { ricorrente, unaTantum } = vociDelContratto(model);
  const righe: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  if (c.recurringCents > 0) {
    righe.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        product: prodottoId(c.pack, ricorrente),
        unit_amount: c.recurringCents,
        recurring: { interval: intervallo(model, c.period as Periodo) },
      },
    });
  }

  // L'attivazione entra come riga senza `recurring`: in Checkout a
  // sottoscrizione una riga una tantum finisce sulla prima fattura e non si
  // ripete. E' il modo con cui Stripe fa i costi di avviamento, e tiene le due
  // cose sullo stesso documento invece di mandare al locale due incassi
  // separati per la stessa firma.
  //
  // Si salta se e' gia' stata fatturata: `activationInvoicedAt` esiste
  // apposta, e rifarla pagare a chi rientra da Checkout una seconda volta
  // sarebbe il tipo di errore che si scopre da un cliente arrabbiato.
  if (unaTantum && c.activationCents > 0 && !c.activationInvoicedAt) {
    righe.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        product: prodottoId(c.pack, unaTantum),
        unit_amount: c.activationCents,
      },
    });
  }

  return righe.length > 0 ? righe : null;
}
