// Etichette e colori di contratti e documenti. Stanno a parte da
// lib/billing/documenti.ts perche' quello importa il database e queste le
// legge anche chi disegna soltanto — stessa divisione fra lib/format.ts e
// lib/menu.ts.

export const STATI_DOCUMENTO: { key: string; label: string; badge: string }[] = [
  { key: "bozza", label: "Bozza", badge: "badge-muted" },
  { key: "emesso", label: "Da incassare", badge: "badge-brand" },
  { key: "pagato", label: "Pagato", badge: "badge-ok" },
  { key: "scaduto", label: "Scaduto", badge: "badge-danger" },
  { key: "annullato", label: "Annullato", badge: "badge-muted" },
];

export function etichettaDocumento(k: string): string {
  return STATI_DOCUMENTO.find((s) => s.key === k)?.label ?? k;
}

export function badgeDocumento(k: string): string {
  return STATI_DOCUMENTO.find((s) => s.key === k)?.badge ?? "badge-muted";
}

export const STATI_CONTRATTO: { key: string; label: string; badge: string }[] = [
  { key: "prova", label: "In prova", badge: "badge-brand" },
  { key: "attivo", label: "Attivo", badge: "badge-ok" },
  { key: "sospeso", label: "Sospeso", badge: "badge-warn" },
  { key: "chiuso", label: "Chiuso", badge: "badge-muted" },
];

export function etichettaContratto(k: string): string {
  return STATI_CONTRATTO.find((s) => s.key === k)?.label ?? k;
}

export function badgeContratto(k: string): string {
  return STATI_CONTRATTO.find((s) => s.key === k)?.badge ?? "badge-muted";
}

export const METODI: { key: string; label: string }[] = [
  { key: "stripe", label: "Stripe" },
  { key: "paypal", label: "PayPal" },
  { key: "bonifico", label: "Bonifico" },
  { key: "contanti", label: "Contanti" },
  { key: "altro", label: "Altro" },
];

export function etichettaMetodo(k: string): string {
  return METODI.find((m) => m.key === k)?.label ?? k;
}

export function dataBreve(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
