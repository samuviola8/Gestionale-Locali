// Quello che serve alla pagina d'ordinazione oltre allo stile della
// prenotazione, che e' la sua sorella: guscio, passi, pillole e riepilogo sono
// gli stessi, e ripeterli qui vorrebbe dire farli invecchiare separatamente.
//
// Qui sotto c'e' solo il menu: le righe dei prodotti, il carrello e la barra in
// fondo che segue il pollice.
export const STILE_ORDINA = `
/* --- Ricerca nel menu --- */
.or-cerca {
  position: relative;
  margin-top: 14px;
}
.or-cerca .input { padding-right: 44px; }

/* La crocetta e' larga quanto un dito: si tocca mentre si cammina, come tutto
   il resto di questa pagina. */
.or-pulisci {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: var(--muted);
}

/* --- Righe del menu --- */
.or-riga {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.or-riga:first-of-type { border-top: none; }

.or-foto {
  width: 52px;
  height: 52px;
  flex: none;
  border-radius: 10px;
  object-fit: cover;
  border: 1px solid var(--border);
}

.or-nome { font-size: 14px; font-weight: 600; line-height: 1.3; }
.or-desc {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}
.or-prezzo {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
}

/* Il piu' e il meno sono grossi come il pollice: si sta ordinando in piedi,
   spesso con una mano sola. */
.or-passo {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 18px;
  line-height: 1;
}
.or-passo:active { transform: scale(0.94); }
.or-passo[data-forte="si"] {
  border-color: var(--brand);
  background: var(--brand);
  color: var(--brand-on);
}

.or-quantita {
  min-width: 26px;
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* --- Carrello --- */
.or-carrello {
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  padding: 12px 14px;
}
.or-voce {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 0;
  font-size: 14px;
}
/* Ogni voce del carrello e' un blocco: la riga con nome, quantita' e prezzo,
   piu' la nota sotto. Il tratteggio separa i blocchi e non le righe, o
   aprendo una nota la linea finirebbe in mezzo alla voce. */
.or-riga-carrello + .or-riga-carrello {
  border-top: 1px dashed var(--border);
}
.or-nota-tasto {
  margin: 0 0 4px 2px;
  font-size: 12px;
  text-decoration: underline;
  color: var(--muted);
}
.or-nota-riga {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px 2px;
}
.or-nota-riga .input { font-size: 14px; }
.or-totale {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.or-conto {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* --- Barra in fondo: quanto stai spendendo, sempre sotto gli occhi --- */
.or-barra {
  position: sticky;
  bottom: 0;
  z-index: 5;
  margin: 18px -20px -96px;
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
}

/* --- La riga dei passi: dove e' arrivato l'ordine --- */
.or-passi {
  display: grid;
  gap: 2px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.or-passo-riga {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
}
.or-passo-riga[data-stato="adesso"] {
  background: var(--brand-50);
  border: 1px solid var(--brand);
}

/* Il pallino e la linea che li unisce: la linea nasce dal pallino e scende
   fino al prossimo, cosi' i passi si leggono come una strada e non come un
   elenco puntato. */
.or-pallino {
  position: relative;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex: none;
  margin-top: 1px;
  border-radius: 999px;
  border: 2px solid var(--border);
  background: var(--surface);
  font-size: 12px;
  line-height: 1;
}
.or-passo-riga:not(:last-child) .or-pallino::after {
  content: "";
  position: absolute;
  top: 22px;
  left: 50%;
  width: 2px;
  height: 18px;
  transform: translateX(-50%);
  background: var(--border);
}
.or-passo-riga[data-stato="fatto"] .or-pallino {
  border-color: var(--brand);
  background: var(--brand);
  color: var(--brand-on);
}
.or-passo-riga[data-stato="fatto"] .or-pallino::after { background: var(--brand); }
.or-passo-riga[data-stato="adesso"] .or-pallino {
  border-color: var(--brand);
  box-shadow: 0 0 0 4px var(--brand-50);
}

.or-passo-titolo { display: block; font-size: 15px; font-weight: 600; }
.or-passo-riga[data-stato="dopo"] .or-passo-titolo {
  font-weight: 500;
  color: var(--muted);
}
.or-passo-detto {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .or-passo:active { transform: none; }
}
`;
