// Stile della landing. Vive qui e non in globals.css perche' riguarda una
// pagina sola: tenerlo insieme al resto vorrebbe dire caricarlo su ogni
// telefono al tavolo, che di questa pagina non sa niente.
//
// L'accento dorato e' della landing e non del tema: i locali hanno il loro
// colore, questa e' la vetrina del prodotto.
export const STILE_LANDING = `
.lp {
  --lp-accent: #a16207;
  --lp-accent-soft: rgba(161, 98, 7, 0.12);
  --lp-ink: var(--text);
  /* Quasi pieno: a 70% sul fondo scuro il pannello spariva e sembrava
     tagliato dal bordo invece che appoggiato dietro al telefono. */
  --lp-glass: color-mix(in srgb, var(--surface) 94%, transparent);
  overflow-x: hidden;
}

.dark .lp {
  --lp-accent: #e0b45e;
  --lp-accent-soft: rgba(224, 180, 94, 0.14);
}

/* I tasti in cima portano mezza pagina piu' giu'. Arrivarci di colpo fa
   credere che la pagina cominci li' e che sopra non ci fosse niente: chi
   scorre, invece, vede passare quello che si sta saltando e capisce che c'e'
   altro da leggere. Sta su html perche' e' lui che scorre, e col :has vale
   solo dove c'e' la vetrina: il menu al tavolo non c'entra niente. */
html:has(.lp) {
  scroll-behavior: smooth;
}

.lp-display {
  font-family: var(--font-playfair), Georgia, serif;
  font-weight: 500;
  letter-spacing: -0.015em;
  line-height: 1.06;
}

.lp-occhiello {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--lp-accent);
}

/* --- Sfondo: un alone caldo che segue la piega delle sezioni, non una
   texture. Serve a dare profondita' senza mettere immagini che poi vanno
   mantenute. --- */
.lp-alone {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(60% 50% at 78% 8%, var(--lp-accent-soft), transparent 70%),
    radial-gradient(50% 40% at 10% 30%, color-mix(in srgb, var(--brand) 10%, transparent), transparent 70%);
}

/* --- Comparsa allo scorrimento. Una sola proprieta' animata, e nessun salto
   di layout: gli elementi occupano il loro posto da subito. --- */
.lp-rivela {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 620ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 620ms cubic-bezier(0.22, 1, 0.36, 1);
  transition-delay: var(--ritardo, 0ms);
}
.lp-rivela.dentro {
  opacity: 1;
  transform: none;
}

/* --- La scena del telefono. La prospettiva sta sul contenitore, cosi' i tre
   pannelli ruotano nello stesso spazio e sembrano appoggiati uno dietro
   l'altro invece che tre disegni piatti affiancati. --- */
.lp-scena {
  position: relative;
  perspective: 1500px;
  perspective-origin: 55% 42%;
  display: grid;
  place-items: center;
  /* Il palco ha misure fisse: i pannelli fluttuano dentro di lui invece che
     dentro la colonna, o al primo schermo stretto finirebbero sul testo. */
  min-height: 520px;
}

.lp-palco {
  position: relative;
  width: 470px;
  height: 470px;
  transform-style: preserve-3d;
  /* Angolo di riposo contenuto: piu' di cosi' e il pannello di destra esce
     dalla colonna e si fa tagliare dal bordo della pagina. */
  transform: rotateX(var(--rx, 7deg)) rotateY(var(--ry, -11deg));
  transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.lp-telefono {
  position: absolute;
  top: 0;
  left: 74px;
  z-index: 2;
  width: 232px;
  border-radius: 34px;
  padding: 9px;
  background: linear-gradient(160deg, #2b2b2b, #0b0b0b);
  box-shadow:
    0 40px 80px -30px rgba(0, 0, 0, 0.55),
    0 2px 0 rgba(255, 255, 255, 0.08) inset;
  transform: translateZ(40px);
}

.lp-schermo {
  border-radius: 26px;
  background: #0c0e0d;
  color: #e9eae8;
  padding: 14px 12px 16px;
  overflow: hidden;
}

/* I pannelli che fluttuano dietro al telefono: sono le altre due facce del
   prodotto, la coda e il conto. */
.lp-pannello {
  position: absolute;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--lp-glass);
  backdrop-filter: blur(10px);
  box-shadow: 0 24px 50px -24px rgba(0, 0, 0, 0.4);
  padding: 12px 14px;
  width: 190px;
}

/* Sporge da dietro al telefono di poco: coprirne meta' lo faceva sembrare
   tagliato invece che appoggiato dietro. */
.lp-pannello-coda {
  top: 10px;
  left: 280px;
  transform: translateZ(-40px) rotateY(7deg);
}

.lp-pannello-conto {
  bottom: 0;
  left: 0;
  transform: translateZ(-70px) rotateY(-5deg);
}

/* --- Mockup: righe finte ma con le proporzioni vere dell'interfaccia. --- */
.lp-riga {
  height: 8px;
  border-radius: 4px;
  background: currentColor;
  opacity: 0.16;
}

.lp-card-menu {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 9px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.lp-thumb {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex: none;
  background: linear-gradient(140deg, rgba(224, 180, 94, 0.5), rgba(224, 180, 94, 0.12));
}

.lp-pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* Pillole di scelta del mockup della prenotazione: hanno le proporzioni di
   quelle vere, dove si toccano col pollice. */
.lp-chip {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.lp-chip[data-attivo="si"] {
  border-color: var(--lp-accent);
  background: var(--lp-accent);
  color: var(--surface);
  font-weight: 600;
}

/* Il cursore fermo a meta' parola nel mockup della rubrica: e' quello che dice
   "sta scrivendo adesso", senza il quale il campo sembra gia' compilato e
   l'elenco sotto non si capisce da dove esca. */
.lp-cursore {
  display: inline-block;
  width: 1px;
  height: 12px;
  margin-left: 1px;
  vertical-align: -2px;
  background: var(--lp-accent);
  animation: lp-batte 1.1s step-end infinite;
}
@keyframes lp-batte {
  50% { opacity: 0; }
}

/* --- Modulo di contatto --- */
.lp-campo {
  display: grid;
  gap: 6px;
}

.lp-etichetta {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
}

/* Come .input ma alto: il messaggio e' il campo che conta, e deve invitare a
   scrivere piu' di una riga. */
.lp-area {
  width: 100%;
  min-height: 108px;
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

/* L'esca per i robot: sparita alla vista ma presente nel modulo. Non si usa
   display:none, che qualche robot sa riconoscere. */
.lp-esca {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  opacity: 0;
}

/* --- Griglia delle sezioni --- */
.lp-sezione {
  position: relative;
  padding: 88px 24px;
}

.lp-contenuto {
  max-width: 1120px;
  margin: 0 auto;
}

.lp-bordo-sopra {
  border-top: 1px solid var(--border);
}

/* Il colore del testo e' scritto e non ereditato: una card puo' finire dentro
   una fascia scura, e li' l'inchiostro chiaro sparirebbe sul fondo chiaro. */
.lp-vetro {
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 20px 40px -32px rgba(0, 0, 0, 0.3);
}

/* La card sale appena al passaggio: conferma che e' un elemento e non un
   disegno, senza mettersi a ballare. */
.lp-vetro-attiva {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
.lp-vetro-attiva:hover {
  transform: translateY(-3px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 30px 50px -30px rgba(0, 0, 0, 0.4);
}

.lp-numero {
  font-family: var(--font-playfair), Georgia, serif;
  font-size: 40px;
  line-height: 1;
  color: var(--lp-accent);
}

.lp-passo-indice {
  font-family: var(--font-playfair), Georgia, serif;
  font-size: 15px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  border: 1px solid var(--lp-accent);
  color: var(--lp-accent);
}

/* Sotto i 1100 la colonna non regge i 470 del palco: si impila, e il telefono
   torna un telefono invece di una scena. */
@media (max-width: 1150px) {
  .lp-scena { perspective: none; min-height: 0; }
  .lp-palco {
    width: 100%;
    height: auto;
    max-width: 380px;
    transform: none;
  }
  .lp-telefono { position: static; margin: 0 auto; transform: none; }
  .lp-pannello {
    position: static;
    width: 100%;
    transform: none;
    margin-top: 14px;
  }
}

@media (max-width: 700px) {
  .lp-sezione { padding: 60px 20px; }
}

/* Chi ha chiesto meno movimento non deve inseguire niente: resta tutto al suo
   posto, gia' visibile. */
@media (prefers-reduced-motion: reduce) {
  .lp-rivela { opacity: 1; transform: none; transition: none; }
  .lp-palco { transform: none; transition: none; }
  .lp-vetro-attiva { transition: none; }
  .lp-vetro-attiva:hover { transform: none; }
  .lp-cursore { animation: none; }
  html:has(.lp) { scroll-behavior: auto; }
}
`;
