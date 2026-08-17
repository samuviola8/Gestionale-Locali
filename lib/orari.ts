// Orari di apertura del locale, e da questi le fasce in cui si puo' ritirare.
//
// Sono per giorno della settimana e a intervalli, non una singola coppia
// apre/chiude: quasi ogni ristorante fa pranzo e cena con la serranda giu' nel
// mezzo, e un orario continuato direbbe che alle 16 si consegna.

export type Fascia = { da: string; a: string };
// Lunedi' = 0. Un giorno assente o con elenco vuoto e' un giorno di chiusura.
export type OrariApertura = Record<string, Fascia[]>;

export const GIORNI = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

export function giornoSettimana(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function inMinuti(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function inOrario(minuti: number): string {
  const m = ((minuti % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function isFascia(v: unknown): v is Fascia {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Fascia).da === "string" &&
    typeof (v as Fascia).a === "string" &&
    /^\d{1,2}:\d{2}$/.test((v as Fascia).da) &&
    /^\d{1,2}:\d{2}$/.test((v as Fascia).a)
  );
}

export function leggiOrari(raw: unknown): OrariApertura {
  const out: OrariApertura = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [g, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    const fasce = v.filter(isFascia).filter((f) => inMinuti(f.a) > inMinuti(f.da));
    if (fasce.length) out[g] = fasce;
  }
  return out;
}

export function aperto(orari: OrariApertura, giorno: number): boolean {
  return (orari[String(giorno)] ?? []).length > 0;
}

// Le fasce di un giorno dentro gli orari di apertura, a passi regolari:
// nessuno concorda un ritiro alle 20:37 ne' prenota per le 20:07.
//
// `anticipo` esclude quello che e' gia' passato piu' il tempo minimo di
// preavviso: proporre "fra due minuti" a chi sta ancora impastando non serve a
// nessuno. `margine` chiude prima della serranda, perche' un ritiro all'ora
// esatta in cui si chiude non esiste — e per la prenotazione quel margine e'
// piu' largo, dato che dopo essersi seduti si mangia.
export type OpzioniFasce = {
  passo?: number;
  anticipo?: number;
  margine?: number;
};

export function fasceOrarie(
  orari: OrariApertura,
  giorno: Date,
  adesso: Date,
  { passo = 15, anticipo = 20, margine = 15 }: OpzioniFasce = {}
): string[] {
  const fasce = orari[String(giornoSettimana(giorno))] ?? [];
  if (!fasce.length) return [];

  const stessoGiorno =
    giorno.getFullYear() === adesso.getFullYear() &&
    giorno.getMonth() === adesso.getMonth() &&
    giorno.getDate() === adesso.getDate();
  const primoUtile = stessoGiorno
    ? adesso.getHours() * 60 + adesso.getMinutes() + anticipo
    : 0;

  const slot: string[] = [];
  for (const f of fasce) {
    const inizio = Math.ceil(Math.max(inMinuti(f.da), primoUtile) / passo) * passo;
    const fine = inMinuti(f.a) - margine;
    for (let m = inizio; m <= fine; m += passo) slot.push(inOrario(m));
  }
  return [...new Set(slot)].sort();
}

export function fasceRitiro(
  orari: OrariApertura,
  giorno: Date,
  adesso: Date,
  minutiMinimi = 20
): string[] {
  return fasceOrarie(orari, giorno, adesso, { anticipo: minutiMinimi });
}

// I prossimi giorni in cui il locale apre. Serve a chi chiama oggi per domani:
// mostrare una data di chiusura vorrebbe dire prendere un ordine che nessuno
// preparera'.
export function giorniDisponibili(
  orari: OrariApertura,
  adesso: Date,
  quanti = 7,
  opzioni: OpzioniFasce = {},
  // Entro quanti giorni cercare. Serve a chi prenota con settimane di
  // anticipo: un locale aperto solo il fine settimana ha quattro giorni utili
  // in un mese, e fermarsi a due settimane glieli dimezzerebbe.
  finestraGiorni = 14
): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < finestraGiorni && out.length < quanti; i++) {
    const d = new Date(
      adesso.getFullYear(),
      adesso.getMonth(),
      adesso.getDate() + i
    );
    if (!aperto(orari, giornoSettimana(d))) continue;
    // Oggi conta solo se resta ancora qualcosa da poter prenotare o ritirare.
    if (i === 0 && fasceOrarie(orari, d, adesso, opzioni).length === 0) continue;
    out.push(d);
  }
  return out;
}

export function dataISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
