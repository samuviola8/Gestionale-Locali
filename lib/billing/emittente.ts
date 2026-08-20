// Chi emette la fattura: i miei dati, non quelli di un locale.
//
// Stanno nell'ambiente e non a database perche' sono uno solo e cambiano una
// volta l'anno scarsa — e perche' la partita IVA arriva prima del pannello
// che la scriverebbe. Finche' mancano, la piattaforma fa lo stesso tutti i
// conti e tiene i documenti in bozza: quello che non si puo' fare e' emetterli.

export type Regime = "ordinario" | "forfettario";

export type Emittente = {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  indirizzo: string;
  cap: string;
  citta: string;
  provincia: string;
  email: string;
  iban: string;
  regime: Regime;
  /** Giorni fra emissione e scadenza del pagamento. */
  giorniScadenza: number;
};

function env(k: string): string {
  return (process.env[k] ?? "").trim();
}

export function getEmittente(): Emittente {
  const regime = env("FATTURAZIONE_REGIME") === "ordinario" ? "ordinario" : "forfettario";
  const giorni = parseInt(env("FATTURAZIONE_GIORNI_SCADENZA"), 10);
  return {
    ragioneSociale: env("FATTURAZIONE_RAGIONE_SOCIALE"),
    partitaIva: env("FATTURAZIONE_PIVA"),
    codiceFiscale: env("FATTURAZIONE_CF"),
    indirizzo: env("FATTURAZIONE_INDIRIZZO"),
    cap: env("FATTURAZIONE_CAP"),
    citta: env("FATTURAZIONE_CITTA"),
    provincia: env("FATTURAZIONE_PROVINCIA"),
    email: env("FATTURAZIONE_EMAIL"),
    iban: env("FATTURAZIONE_IBAN"),
    regime,
    giorniScadenza: Number.isInteger(giorni) && giorni > 0 ? giorni : 15,
  };
}

/** Cosa manca per poter emettere davvero. Vuoto = si puo'. */
export function mancanzeEmittente(e: Emittente = getEmittente()): string[] {
  const mancano: string[] = [];
  if (!e.ragioneSociale) mancano.push("ragione sociale");
  if (!e.partitaIva) mancano.push("partita IVA");
  if (!e.indirizzo || !e.cap || !e.citta) mancano.push("sede");
  return mancano;
}

// Aliquota in punti base: 2200 = 22%. Nel forfettario l'IVA non si applica,
// e non e' un caso da trattare come "zero per cento" — e' un'operazione fuori
// campo, con la sua riga di legge sotto il totale.
export function aliquotaBps(e: Emittente = getEmittente()): number {
  return e.regime === "forfettario" ? 0 : 2200;
}

export function notaIva(e: Emittente = getEmittente()): string | null {
  if (e.regime !== "forfettario") return null;
  return "Operazione senza applicazione dell'IVA ai sensi dell'art. 1, commi 54-89, Legge 190/2014 - regime forfettario.";
}

// Marca da bollo: due euro, e solo quando l'IVA non c'e' e l'imponibile supera
// i 77,47. Sotto quella soglia non si applica, e applicarla lo stesso vuol
// dire farsi correggere dal commercialista del cliente.
export const SOGLIA_BOLLO_CENTS = 7747;
export const BOLLO_CENTS = 200;

export function bolloDovutoCents(imponibileCents: number, ivaCents: number): number {
  if (ivaCents > 0) return 0;
  return imponibileCents > SOGLIA_BOLLO_CENTS ? BOLLO_CENTS : 0;
}
