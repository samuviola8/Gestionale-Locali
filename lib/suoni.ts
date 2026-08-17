// I suoni delle chiamate al tavolo.
//
// Non sono file audio: sono descrizioni di note che il browser suona da solo.
// Un mp3 andrebbe scaricato, servito, tenuto aggiornato e su qualche
// dispositivo non partirebbe; qui non c'e' niente da caricare, il suono e'
// identico ovunque e aggiungerne uno costa tre righe.
//
// Il modulo non tocca il browser finche' non si chiama `suona`: cosi' anche la
// pagina delle impostazioni, che e' resa dal server, puo' leggere l'elenco.

export type Nota = {
  // Frequenza in hertz. Con `a` la nota scivola da `f` ad `a`: e' cosi' che si
  // fanno le sirene e i richiami.
  f: number;
  a?: number;
  // Da quando parte e quanto dura, in secondi dall'inizio del suono.
  t: number;
  d: number;
  onda?: OscillatorType;
  // Volume della nota, da 0 a 1.
  v?: number;
};

export type Suono = {
  chiave: string;
  nome: string;
  note: Nota[];
};

// Nessun suono: e' un'opzione come le altre, non l'assenza di scelta.
export const SUONO_MUTO = "muto";

export const SUONI: Suono[] = [
  {
    chiave: "campanello",
    nome: "Campanello",
    note: [
      { f: 1318, t: 0, d: 0.5, v: 0.5 },
      { f: 1046, t: 0.09, d: 0.6, v: 0.45 },
    ],
  },
  {
    chiave: "ding",
    nome: "Ding",
    note: [{ f: 880, t: 0, d: 0.9, v: 0.5 }],
  },
  {
    chiave: "dindon",
    nome: "Din-don",
    note: [
      { f: 659, t: 0, d: 0.45, v: 0.5 },
      { f: 523, t: 0.24, d: 0.8, v: 0.5 },
    ],
  },
  {
    chiave: "trillo",
    nome: "Trillo",
    note: [
      { f: 784, t: 0, d: 0.12, v: 0.4 },
      { f: 988, t: 0.1, d: 0.12, v: 0.4 },
      { f: 1318, t: 0.2, d: 0.35, v: 0.4 },
    ],
  },
  {
    chiave: "arpeggio",
    nome: "Arpeggio",
    note: [
      { f: 523, t: 0, d: 0.3, v: 0.35 },
      { f: 659, t: 0.08, d: 0.3, v: 0.35 },
      { f: 784, t: 0.16, d: 0.3, v: 0.35 },
      { f: 1046, t: 0.24, d: 0.5, v: 0.4 },
    ],
  },
  {
    chiave: "marimba",
    nome: "Marimba",
    note: [
      { f: 523, t: 0, d: 0.22, onda: "triangle", v: 0.55 },
      { f: 784, t: 0.13, d: 0.32, onda: "triangle", v: 0.5 },
    ],
  },
  {
    chiave: "carillon",
    nome: "Carillon",
    note: [
      { f: 1046, t: 0, d: 0.7, v: 0.3 },
      { f: 1318, t: 0.12, d: 0.7, v: 0.28 },
      { f: 1568, t: 0.24, d: 0.9, v: 0.26 },
    ],
  },
  {
    chiave: "blip",
    nome: "Blip",
    note: [
      { f: 1200, t: 0, d: 0.06, onda: "square", v: 0.22 },
      { f: 1600, t: 0.11, d: 0.06, onda: "square", v: 0.22 },
    ],
  },
  {
    chiave: "sonar",
    nome: "Sonar",
    note: [
      { f: 660, a: 440, t: 0, d: 0.55, v: 0.4 },
      { f: 660, a: 440, t: 0.6, d: 0.55, v: 0.3 },
    ],
  },
  {
    chiave: "richiamo",
    nome: "Richiamo",
    note: [
      { f: 440, a: 880, t: 0, d: 0.22, v: 0.35 },
      { f: 880, a: 440, t: 0.22, d: 0.28, v: 0.3 },
    ],
  },
  {
    chiave: "legno",
    nome: "Legno",
    note: [
      { f: 320, t: 0, d: 0.09, onda: "triangle", v: 0.6 },
      { f: 300, t: 0.16, d: 0.11, onda: "triangle", v: 0.5 },
    ],
  },
  {
    chiave: "cristallo",
    nome: "Cristallo",
    note: [
      { f: 1760, t: 0, d: 0.5, v: 0.22 },
      { f: 2637, t: 0.05, d: 0.6, v: 0.16 },
      { f: 2093, t: 0.18, d: 0.7, v: 0.18 },
    ],
  },
];

export function suonoValido(chiave: string): boolean {
  return chiave === SUONO_MUTO || SUONI.some((s) => s.chiave === chiave);
}

// Un contesto audio solo per tutta la pagina: aprirne uno a ogni suono li
// lascia aperti, e dopo qualche decina il browser smette di darne altri.
let contesto: AudioContext | null = null;

function apriContesto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  contesto ??= new Ctx();
  return contesto;
}

// I browser non lasciano suonare niente finche' l'utente non ha toccato la
// pagina: al primo tocco si apre il contesto, cosi' la chiamata che arriva
// mezz'ora dopo trova la strada gia' aperta. Senza, il primo squillo di ogni
// sessione andrebbe perso — proprio quello che non si puo' perdere.
export function sbloccaAudio(): void {
  const ctx = apriContesto();
  if (ctx?.state === "suspended") void ctx.resume();
}

export function suona(chiave: string): void {
  if (chiave === SUONO_MUTO) return;
  const suono = SUONI.find((s) => s.chiave === chiave);
  if (!suono) return;

  const ctx = apriContesto();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const ora = ctx.currentTime;

  // Un guadagno solo per tutto il suono: le note di un arpeggio si accavallano
  // e sommate arriverebbero oltre il fondo scala, dove il browser non alza il
  // volume ma sporca il suono. Meglio un filo piu' piano e pulito.
  const generale = ctx.createGain();
  // 0.9 e non 1: il suono piu' forte del catalogo arriva a 0.6, quindi c'e'
  // margine, e chi ne aggiunge uno un po' piu' pieno non fa danni.
  generale.gain.value = 0.9;
  generale.connect(ctx.destination);

  for (const n of suono.note) {
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = n.onda ?? "sine";
    osc.frequency.setValueAtTime(n.f, ora + n.t);
    if (n.a) osc.frequency.linearRampToValueAtTime(n.a, ora + n.t + n.d);

    // Attacco corto e coda che si spegne da sola: una nota che finisce di
    // netto fa "clac", ed e' l'unica cosa che si sente.
    const picco = n.v ?? 0.4;
    vol.gain.setValueAtTime(0.0001, ora + n.t);
    vol.gain.exponentialRampToValueAtTime(picco, ora + n.t + 0.008);
    vol.gain.exponentialRampToValueAtTime(0.0001, ora + n.t + n.d);

    osc.connect(vol).connect(generale);
    osc.start(ora + n.t);
    osc.stop(ora + n.t + n.d + 0.02);
  }
}
