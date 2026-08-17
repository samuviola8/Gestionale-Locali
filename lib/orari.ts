// Orari di apertura del locale, e da questi le fasce in cui si puo' ritirare.
//
// Sono per giorno della settimana e a intervalli, non una singola coppia
// apre/chiude: quasi ogni ristorante fa pranzo e cena con la serranda giu' nel
// mezzo, e un orario continuato direbbe che alle 16 si consegna.

export type Fascia = { da: string; a: string };
// Lunedi' = 0. Un giorno assente o con elenco vuoto e' un giorno di chiusura.
export type OrariApertura = Record<string, Fascia[]>;

// Una chiusura a data fissa: Natale, le ferie, il giorno del funzionamento
// della caldaia. Da e a sono date ISO, estremi compresi: un giorno solo si
// scrive con `da` uguale ad `a`.
export type Chiusura = { da: string; a: string; nota?: string };

// Gli orari e le chiusure viaggiano insieme.
//
// Tenerli separati vorrebbe dire passarli entrambi a ogni funzione che decide
// se si puo' prenotare o ritirare, e il giorno che una pagina si dimentica il
// secondo argomento il locale prende una prenotazione a Natale senza che
// nessuno se ne accorga fino al 25.
export type Calendario = {
  settimana: OrariApertura;
  chiusure: Chiusura[];
};

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

// Una data ISO e' valida e scritta bene? Le chiusure arrivano da un modulo e
// finiscono in un confronto fra stringhe: una data storta li' dentro non da'
// errore, semplicemente non chiude mai niente.
function dataValida(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function leggiChiusure(raw: unknown): Chiusura[] {
  if (!Array.isArray(raw)) return [];
  const out: Chiusura[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const { da, a, nota } = v as Chiusura;
    if (!dataValida(da)) continue;
    // Una chiusura di un giorno solo puo' arrivare senza fine, e un periodo
    // al contrario e' un errore di battitura: si raddrizza invece di buttarlo.
    const fine = dataValida(a) ? a : da;
    out.push({
      da: da < fine ? da : fine,
      a: da < fine ? fine : da,
      ...(typeof nota === "string" && nota.trim()
        ? { nota: nota.trim().slice(0, 60) }
        : {}),
    });
  }
  return out.sort((x, y) => x.da.localeCompare(y.da));
}

export function leggiCalendario(
  orariRaw: unknown,
  chiusureRaw: unknown
): Calendario {
  return {
    settimana: leggiOrari(orariRaw),
    chiusure: leggiChiusure(chiusureRaw),
  };
}

// La chiusura che copre questa data, se c'e'. Le date ISO si confrontano come
// stringhe: "2026-12-25" sta fra "2026-12-24" e "2026-12-26" senza bisogno di
// costruire tre oggetti Date per ogni giorno dell'elenco.
export function chiusuraDi(cal: Calendario, giorno: Date): Chiusura | null {
  const d = dataISO(giorno);
  return cal.chiusure.find((c) => c.da <= d && d <= c.a) ?? null;
}

// Chiusure che devono ancora arrivare o sono in corso. Quelle passate restano
// a database — servono a spiegare un mese di incassi — ma in pagina sarebbero
// solo un elenco che cresce.
export function chiusureFuture(chiusure: Chiusura[], oggi: Date): Chiusura[] {
  const d = dataISO(oggi);
  return chiusure.filter((c) => c.a >= d);
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
  cal: Calendario,
  giorno: Date,
  adesso: Date,
  { passo = 15, anticipo = 20, margine = 15 }: OpzioniFasce = {}
): string[] {
  // Una chiusura vince sull'orario della settimana: il 25 dicembre e' un
  // giovedi' come gli altri, e senza questo controllo aprirebbe.
  if (chiusuraDi(cal, giorno)) return [];

  const fasce = cal.settimana[String(giornoSettimana(giorno))] ?? [];
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
  cal: Calendario,
  giorno: Date,
  adesso: Date,
  minutiMinimi = 20
): string[] {
  return fasceOrarie(cal, giorno, adesso, { anticipo: minutiMinimi });
}

// I prossimi giorni in cui il locale apre. Serve a chi chiama oggi per domani:
// mostrare una data di chiusura vorrebbe dire prendere un ordine che nessuno
// preparera'.
export function giorniDisponibili(
  cal: Calendario,
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
    if (!aperto(cal.settimana, giornoSettimana(d))) continue;
    if (chiusuraDi(cal, d)) continue;
    // Oggi conta solo se resta ancora qualcosa da poter prenotare o ritirare.
    if (i === 0 && fasceOrarie(cal, d, adesso, opzioni).length === 0) continue;
    out.push(d);
  }
  return out;
}

// --- Feste ----------------------------------------------------------------

// Pasqua, con l'algoritmo di Meeus: e' l'unica festa italiana che si sposta, e
// senza calcolarla il locale dovrebbe cercarla sul calendario ogni anno.
function pasqua(anno: number): Date {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const giorni = h + l - 7 * m + 114;
  return new Date(anno, Math.floor(giorni / 31) - 1, (giorni % 31) + 1);
}

// Le feste italiane di un anno, per poterle chiudere con un tocco invece di
// scriverle a mano una per una. Che poi il locale chiuda o no e' affar suo:
// molti a Ferragosto lavorano piu' del solito.
export function festivi(anno: number): { data: string; nome: string }[] {
  const p = pasqua(anno);
  const pasquetta = new Date(anno, p.getMonth(), p.getDate() + 1);
  return [
    { data: `${anno}-01-01`, nome: "Capodanno" },
    { data: `${anno}-01-06`, nome: "Epifania" },
    { data: dataISO(p), nome: "Pasqua" },
    { data: dataISO(pasquetta), nome: "Lunedì dell'Angelo" },
    { data: `${anno}-04-25`, nome: "Liberazione" },
    { data: `${anno}-05-01`, nome: "Festa del lavoro" },
    { data: `${anno}-06-02`, nome: "Festa della Repubblica" },
    { data: `${anno}-08-15`, nome: "Ferragosto" },
    { data: `${anno}-11-01`, nome: "Ognissanti" },
    { data: `${anno}-12-08`, nome: "Immacolata" },
    { data: `${anno}-12-25`, nome: "Natale" },
    { data: `${anno}-12-26`, nome: "Santo Stefano" },
  ].sort((x, y) => x.data.localeCompare(y.data));
}

export function dataISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
