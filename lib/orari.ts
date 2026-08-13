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

// Le fasce ritirabili di un giorno, a passi di un quarto d'ora: nessuno
// concorda un ritiro alle 20:37.
//
// `da` esclude quello che e' gia' passato piu' il tempo minimo di
// preparazione: proporre "fra due minuti" a chi sta ancora impastando non
// serve a nessuno. Si smette un quarto d'ora prima della chiusura, perche'
// un ritiro all'ora esatta in cui si abbassa la serranda non esiste.
export function fasceRitiro(
  orari: OrariApertura,
  giorno: Date,
  adesso: Date,
  minutiMinimi = 20
): string[] {
  const fasce = orari[String(giornoSettimana(giorno))] ?? [];
  if (!fasce.length) return [];

  const stessoGiorno =
    giorno.getFullYear() === adesso.getFullYear() &&
    giorno.getMonth() === adesso.getMonth() &&
    giorno.getDate() === adesso.getDate();
  const primoUtile = stessoGiorno
    ? adesso.getHours() * 60 + adesso.getMinutes() + minutiMinimi
    : 0;

  const slot: string[] = [];
  for (const f of fasce) {
    const inizio = Math.ceil(Math.max(inMinuti(f.da), primoUtile) / 15) * 15;
    const fine = inMinuti(f.a) - 15;
    for (let m = inizio; m <= fine; m += 15) slot.push(inOrario(m));
  }
  return [...new Set(slot)].sort();
}

// I prossimi giorni in cui il locale apre. Serve a chi chiama oggi per domani:
// mostrare una data di chiusura vorrebbe dire prendere un ordine che nessuno
// preparera'.
export function giorniDisponibili(
  orari: OrariApertura,
  adesso: Date,
  quanti = 7
): Date[] {
  const out: Date[] = [];
  for (let i = 0; i < 14 && out.length < quanti; i++) {
    const d = new Date(
      adesso.getFullYear(),
      adesso.getMonth(),
      adesso.getDate() + i
    );
    if (!aperto(orari, giornoSettimana(d))) continue;
    // Oggi conta solo se resta ancora qualcosa da poter ritirare.
    if (i === 0 && fasceRitiro(orari, d, adesso).length === 0) continue;
    out.push(d);
  }
  return out;
}

export function dataISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
