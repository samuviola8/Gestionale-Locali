// Il vocabolario delle segnalazioni, in un posto solo: dashboard e admin
// devono chiamare le stesse cose con le stesse parole.

export const TIPI = [
  {
    key: "blocco",
    label: "Non funziona",
    aiuto: "Non riesco a lavorare",
  },
  {
    key: "fastidio",
    label: "Va storto",
    aiuto: "Si puo' fare, ma male",
  },
  {
    key: "idea",
    label: "Idea",
    aiuto: "Si potrebbe aggiungere",
  },
] as const;

export type TipoSegnalazione = (typeof TIPI)[number]["key"];

export function etichettaTipo(k: string): string {
  return TIPI.find((t) => t.key === k)?.label ?? k;
}

export const STATI = [
  { key: "aperta", label: "Da vedere", badge: "badge-danger" },
  { key: "presa", label: "Ci sto lavorando", badge: "badge-warn" },
  { key: "risolta", label: "Risolta", badge: "badge-ok" },
] as const;

export type StatoSegnalazione = (typeof STATI)[number]["key"];

export function etichettaStato(k: string): string {
  return STATI.find((s) => s.key === k)?.label ?? k;
}

export function badgeStato(k: string): string {
  return STATI.find((s) => s.key === k)?.badge ?? "badge-muted";
}

export const LUNGHEZZA_MIN = 5;
export const LUNGHEZZA_MAX = 2000;

// Una riga dell'elenco, come la leggono il pannello nella barra e l'admin.
export type SegnalazioneInLista = {
  id: string;
  kind: string;
  message: string;
  status: string;
  reply: string | null;
  createdAt: Date;
  repliedAt: Date | null;
  replySeenAt: Date | null;
  autore: string | null;
};
