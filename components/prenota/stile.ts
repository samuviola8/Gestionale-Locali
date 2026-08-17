// Stile della pagina di prenotazione. Come per la vetrina vive in un file suo
// e non in globals.css: e' l'unica pagina che lo usa, e caricarlo su ogni
// telefono al tavolo sarebbe peso inutile.
//
// I colori sono quelli del locale (variabili del tema): questa e' una pagina
// del ristorante, non del prodotto, e chi ci arriva dev'esserci in casa.
export const STILE_PRENOTA = `
.pr {
  --pr-raggio: 14px;
  min-height: 100%;
}

.pr-guscio {
  max-width: 640px;
  margin: 0 auto;
  padding: 28px 20px 96px;
}

/* --- Intestazione --- */
.pr-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: fit-content;
  margin: 0 auto;
  padding: 14px 22px;
  border-radius: 18px;
  background: #000;
}

.pr-occhiello {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--brand-text);
}

/* --- Blocco di un passo --- */
.pr-passo {
  border-top: 1px solid var(--border);
  padding: 22px 0 4px;
}
.pr-passo:first-of-type { border-top: none; padding-top: 8px; }

.pr-titolo-passo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
}

.pr-indice {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.pr-indice[data-fatto="si"] {
  border-color: var(--brand);
  background: var(--brand);
  color: var(--brand-on);
}

/* --- Pillole di scelta. 44px di altezza: si toccano con il pollice mentre si
   cammina, che e' esattamente come si prenota un tavolo. --- */
.pr-scelte {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

/* I giorni scorrono di lato invece di impilarsi: sono due settimane, e in
   colonna spingerebbero l'orario — il passo che conta — fuori schermo. */
.pr-fila {
  flex-wrap: nowrap;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 6px;
  scroll-snap-type: x proximity;
}
.pr-fila > * {
  flex: none;
  scroll-snap-align: start;
}

.pr-chip {
  min-height: 44px;
  min-width: 44px;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}
.pr-chip:hover { background: var(--surface-2); }
.pr-chip:active { transform: scale(0.97); }
.pr-chip[aria-pressed="true"] {
  border-color: var(--brand);
  background: var(--brand);
  color: var(--brand-on);
  font-weight: 600;
}

/* Il giorno su due righe: il numero si legge da lontano, il nome del giorno
   dice se e' quello giusto senza fare i conti col calendario. */
.pr-chip-giorno {
  display: grid;
  gap: 1px;
  padding: 6px 14px;
  line-height: 1.15;
  text-align: center;
}
.pr-chip-giorno small {
  font-size: 11px;
  opacity: 0.72;
  text-transform: lowercase;
}

.pr-ore {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 8px;
  margin-top: 14px;
}

/* --- Attesa: le pillole finte hanno la misura di quelle vere, cosi' quando
   arrivano le risposte la pagina non salta. --- */
.pr-scheletro {
  height: 44px;
  border-radius: 12px;
}

/* --- I dati compaiono quando l'ora e' scelta: prima chiedere nome e telefono
   e' chiedere l'impegno prima di aver dato la cosa che si cercava. --- */
.pr-appare {
  animation: pr-entra 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes pr-entra {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

.pr-campo { display: grid; gap: 6px; }
.pr-etichetta { font-size: 12px; font-weight: 600; color: var(--muted); }

.pr-area {
  width: 100%;
  min-height: 74px;
  padding: 10px 12px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

/* Riquadro col riepilogo di quello che si sta per prenotare. */
.pr-riepilogo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  border-radius: var(--pr-raggio);
  border: 1px solid var(--brand);
  background: var(--brand-50);
  color: var(--brand-text);
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
}

.pr-avviso {
  border-radius: var(--pr-raggio);
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  padding: 14px;
  font-size: 13px;
  line-height: 1.55;
}

.pr-esca {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .pr-appare { animation: none; }
  .pr-chip { transition: none; }
  .pr-chip:active { transform: none; }
}
`;
