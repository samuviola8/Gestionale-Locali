import type { ModuleKey } from "@/lib/modules";

// Il listino vive nel codice, come i temi e il catalogo dei moduli: e' una
// decisione commerciale, non un dato del locale. Quello che finisce a
// database e' il contratto firmato — prezzo, periodo, data di rinnovo — e ci
// resta come istantanea. Se domani alzo il listino, chi ha gia' firmato
// continua a pagare quello che aveva accettato, e lo si vede senza dover
// ricostruire quale versione del listino era in vigore a marzo.

export type PaccoKey = "sala" | "locale" | "tutto";

export type Pacco = {
  // Non solo `PaccoKey`: il pacchetto su misura di un locale e' un Pacco a
  // tutti gli effetti — ha nome, moduli e prezzi — ma la sua chiave non sta
  // nel catalogo, perche' non e' di tutti.
  key: PaccoKey | "su_misura";
  label: string;
  descrizione: string;
  moduli: ModuleKey[];
  // Abbonamento: canone al mese, e il prezzo di un anno pagato in anticipo
  // (dodici mesi al prezzo di dieci).
  mensileCents: number;
  annualeCents: number;
  // Impianto: si paga una volta all'inizio, poi resta il canone di assistenza.
  // Vale circa due anni e mezzo di abbonamento — chi resta di piu' ci
  // guadagna, e a me conviene comunque perche' l'incasso arriva subito.
  attivazioneCents: number;
  assistenzaCents: number;
};

export const PACCHETTI: Pacco[] = [
  {
    key: "sala",
    label: "Base",
    descrizione: "Ordinazione da QR, sotto-conti e chiamata cameriere.",
    moduli: ["qr_ordering", "split_bill", "waiter_call"],
    mensileCents: 4900,
    annualeCents: 49000,
    attivazioneCents: 89000,
    assistenzaCents: 2900,
  },
  {
    key: "locale",
    label: "Pro",
    descrizione:
      "Tutto Base, piu' cassa al banco, prenotazione web, rubrica, asporto e ordini dal sito.",
    moduli: [
      "qr_ordering",
      "split_bill",
      "waiter_call",
      "counter_orders",
      "reservations",
      "customers",
      "takeaway",
      "web_orders",
    ],
    mensileCents: 8900,
    annualeCents: 89000,
    attivazioneCents: 149000,
    assistenzaCents: 3900,
  },
  {
    key: "tutto",
    label: "Premium",
    descrizione: "Tutto Pro, piu' la consegna a domicilio.",
    moduli: [
      "qr_ordering",
      "split_bill",
      "waiter_call",
      "counter_orders",
      "reservations",
      "customers",
      "takeaway",
      "web_orders",
      "delivery",
    ],
    // Tolta la fedelta', Premium aggiunge a Pro la sola consegna: a 149 sarebbe
    // costato 60 euro per un modulo che a listino singolo ne vale 29, e chi fa
    // il conto se ne accorge. 109 lascia 9 euro di risparmio rispetto a
    // comprarsela a parte, che e' il motivo per cui un pacchetto esiste.
    mensileCents: 10900,
    annualeCents: 109000,
    attivazioneCents: 169000,
    assistenzaCents: 4500,
  },
];

export function getPacco(key: PaccoKey): Pacco {
  return PACCHETTI.find((p) => p.key === key)!;
}

export function isPaccoKey(v: string): v is PaccoKey {
  return PACCHETTI.some((p) => p.key === v);
}

// Prezzo del singolo modulo preso fuori pacchetto. Zero non vuol dire gratis
// per sbaglio: vuol dire che non si vende da solo. `split_bill` e la chiamata
// cameriere sono il motivo per cui il locale ci prova, metterli a listino a
// parte indebolisce la dimostrazione; `customers` da sola non serve a niente,
// e' la dipendenza di asporto e consegna; `payments` non ha canone perche' si
// paga sul transato.
export const PREZZI_MODULI: Record<ModuleKey, number> = {
  qr_ordering: 3900,
  split_bill: 0,
  waiter_call: 0,
  counter_orders: 1900,
  reservations: 2500,
  takeaway: 1900,
  delivery: 2900,
  // Sta sopra asporto e consegna: da solo non fa niente, ma e' quello che
  // toglie la telefonata — il cliente ordina dal sito e il locale accetta.
  // Prezzato come la prenotazione web, che e' la stessa cosa per il tavolo.
  web_orders: 2500,
  customers: 900,
  payments: 0,
  ai_suggestions: 2900,
  ai_phone: 7900,
  loyalty: 1900,
};

// Commissione sul transato incassato dal locale col modulo pagamenti, in punti
// base: 40 = 0,40%. Il locale incassa col proprio PSP, questa e' la quota
// piattaforma e si fattura B2B a fine mese.
export const TRANSATO_BPS_DEFAULT = 40;

// Somma dei moduli attivi, per far vedere in trattativa quanto costerebbero
// presi uno a uno: e' il prezzo barrato accanto a quello del pacchetto.
export function prezzoAlaCarte(moduli: ModuleKey[]): number {
  return moduli.reduce((s, k) => s + (PREZZI_MODULI[k] ?? 0), 0);
}

// Il pacchetto piu' piccolo che copre tutti i moduli accesi. Null quando la
// combinazione non sta in nessuno: capita, e in quel caso il canone si scrive
// a mano invece di far finta che il locale abbia il piano "Tutto".
export function paccoCheCopre(moduli: ModuleKey[]): Pacco | null {
  const richiesti = moduli.filter((k) => PREZZI_MODULI[k] > 0 || k === "split_bill");
  return (
    PACCHETTI.find((p) => richiesti.every((k) => p.moduli.includes(k))) ?? null
  );
}
