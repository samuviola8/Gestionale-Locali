"use client";

import { useEffect, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";

// Guida per chi si siede, inquadra il QR e non ha mai visto un menu digitale.
// Si apre da sola la prima volta su quel telefono e poi resta dietro al
// pulsante "Come funziona": un tutorial non lo si legge due volte, ma lo si
// cerca quando ci si blocca.
//
// I passi si costruiscono sui moduli attivi del locale: dove il conto non si
// divide, di sotto-conti e condiviso non si parla proprio.

// Cambiando, la guida si riapre da sola anche a chi l'aveva gia' vista: il
// modo di dividere non e' un dettaglio grafico, e chi non lo sa non lo cerca.
const VERSIONE = "v2";

type Passo = {
  chiave: string;
  titolo: string;
  testo: string;
  punti?: string[];
  // Pezzetto di interfaccia finta: si riconosce a colpo d'occhio quello di cui
  // si sta parlando, senza doverlo cercare nella pagina vera.
  mock?: React.ReactNode;
};

// "120 minuti" e' il dato che abbiamo, "2 ore" e' quello che si capisce.
function durata(minuti: number): string {
  if (minuti < 60) return `${minuti} minuti`;
  const ore = minuti / 60;
  if (Number.isInteger(ore)) return ore === 1 ? "un'ora" : `${ore} ore`;
  return `${Math.floor(ore)} ore e ${minuti % 60} minuti`;
}

function Riquadro({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-xl border bd bg-neutral-50 p-3">{children}</div>
  );
}

function Pillola({ testo, attiva }: { testo: string; attiva?: boolean }) {
  return (
    <span
      className={
        "rounded-full px-3 py-1.5 text-xs font-medium " +
        (attiva
          ? "bg-[var(--brand)] text-[var(--brand-on)]"
          : "border border-neutral-200 bg-white text-neutral-600")
      }
    >
      {testo}
    </span>
  );
}

function MockPersone() {
  return (
    <Riquadro>
      <div className="text-[11px] font-medium text-neutral-500">Aggiungi per</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pillola testo="Io" attiva />
        <Pillola testo="Condiviso" />
        <Pillola testo="Giulia" />
        <span className="rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-500">
          + persona
        </span>
      </div>
    </Riquadro>
  );
}

// La riga che si apre sotto "Condiviso": e' li' che si decide con chi, ed e'
// la cosa che nessuno si aspetta di trovare.
function MockScelta() {
  return (
    <Riquadro>
      <div className="text-[11px] font-medium text-neutral-500">Aggiungi per</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pillola testo="Io" />
        <Pillola testo="Condiviso" attiva />
        <Pillola testo="Giulia" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-neutral-200 pt-2">
        <Pillola testo="Tutti · in 4" attiva />
        <span className="rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-xs text-neutral-500">
          Personalizzato
        </span>
      </div>
    </Riquadro>
  );
}

function MockCondiviso() {
  return (
    <Riquadro>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Tagliere · Tutti</span>
        <span className="font-semibold tabular-nums">{fmt(1800)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs text-neutral-500">
        <span>diviso in 4</span>
        <span className="tabular-nums">{fmt(450)} a testa</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-neutral-200 pt-2 text-sm">
        <span className="font-medium">Pizza · Io e Giulia</span>
        <span className="font-semibold tabular-nums">{fmt(900)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between text-xs text-neutral-500">
        <span>diviso in 2</span>
        <span className="tabular-nums">{fmt(450)} a testa</span>
      </div>
    </Riquadro>
  );
}

function MockCarrello({ splitBill }: { splitBill: boolean }) {
  return (
    <Riquadro>
      {/* Senza sotto-conti non ci sono ne' intestazioni per persona ne' tendina
          per spostare le voci: mostrarle qui prometterebbe roba che non c'e'. */}
      {splitBill && (
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">Giulia</span>
          <span className="font-medium tabular-nums">{fmt(1000)}</span>
        </div>
      )}
      <div className={"flex items-center gap-2 text-sm " + (splitBill ? "mt-2" : "")}>
        <span className="flex items-center rounded-lg border border-neutral-200 bg-white">
          <span className="px-2 py-0.5 text-neutral-400">−</span>
          <span className="w-4 text-center tabular-nums">1</span>
          <span className="px-2 py-0.5 text-neutral-400">+</span>
        </span>
        <span className="min-w-0 flex-1 truncate">Spritz</span>
        {splitBill ? (
          <span className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600">
            Giulia ▾
          </span>
        ) : (
          <span className="font-medium tabular-nums">{fmt(1000)}</span>
        )}
      </div>
      <div className="mt-1 pl-2 text-xs italic text-neutral-500">
        «senza oliva»
      </div>
    </Riquadro>
  );
}

function MockStati() {
  return (
    <Riquadro>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span
          className="rounded-full px-2.5 py-1"
          style={{ background: "var(--brand-50)", color: "var(--brand-text)" }}
        >
          Ricevuto
        </span>
        <span className="text-neutral-400">→</span>
        <span
          className="rounded-full px-2.5 py-1"
          style={{ background: "var(--brand-50)", color: "var(--brand-text)" }}
        >
          In preparazione
        </span>
        <span className="text-neutral-400">→</span>
        <span
          className="rounded-full px-2.5 py-1"
          style={{ background: "var(--ok-bg)", color: "var(--ok)" }}
        >
          Servito
        </span>
      </div>
    </Riquadro>
  );
}

function MockConto({ coperto }: { coperto: number }) {
  const totale = 1000 + 450 + coperto;
  return (
    <Riquadro>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">Giulia</span>
        <span className="font-semibold tabular-nums">{fmt(totale)}</span>
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-neutral-500">
        <div className="flex justify-between gap-3">
          <span>Consumazioni</span>
          <span className="tabular-nums">{fmt(1000)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Quota condiviso</span>
          <span className="tabular-nums">{fmt(450)}</span>
        </div>
        {coperto > 0 && (
          <div className="flex justify-between gap-3">
            <span>Coperto</span>
            <span className="tabular-nums">{fmt(coperto)}</span>
          </div>
        )}
      </div>
    </Riquadro>
  );
}

function costruisciPassi({
  tableNumber,
  splitBill,
  waiterCall,
  coperto,
  minuti,
}: {
  tableNumber: number;
  splitBill: boolean;
  waiterCall: boolean;
  coperto: number;
  minuti: number;
}): Passo[] {
  const passi: Passo[] = [];

  passi.push({
    chiave: "menu",
    titolo: "Il menu è sul tuo telefono",
    testo: `Hai aperto il tavolo ${tableNumber}. Da qui ordini quando vuoi: la comanda arriva al banco subito, senza aspettare che passi qualcuno.`,
    punti: [
      "Cerca per piatto o per ingrediente: «gin», «senza glutine», quello che ti serve.",
      `Il QR vale solo per questo tavolo e per ${durata(minuti)}. Se scade, inquadralo di nuovo.`,
    ],
  });

  if (splitBill) {
    passi.push({
      chiave: "persone",
      titolo: "Ognuno ha la sua parte",
      testo:
        "Scrivi il tuo nome all'inizio: tutto quello che aggiungi resta intestato a te. Con «+ persona» metti al conto anche gli altri — tocca il suo nome, poi il piatto, e va sul suo.",
      punti: [
        "Se paga tutto il tavolo, salta il nome: si fa un conto solo.",
        "Ordinate dallo stesso telefono o ognuno dal suo: il tavolo è lo stesso.",
      ],
      mock: <MockPersone />,
    });

    passi.push({
      chiave: "condiviso",
      titolo: "Quello che è di tutti, o solo di due",
      testo:
        "La bottiglia per il tavolo, la pizza da dividere in due: tocca «Condiviso» e sotto scegli con chi. «Tutti» lo divide per quante persone siete — te lo chiediamo una volta sola. «Personalizzato» lo divide solo tra chi spunti tu.",
      punti: [
        "Un gruppo non vale per una cosa sola: una volta fatto resta lì, e ci metti dentro anche il resto del giro.",
        "Chi è fuori dal gruppo di quel piatto non ne paga niente.",
        "La divisione è esatta al centesimo: la somma delle parti torna sempre al prezzo pieno.",
        "Se qualcuno arriva a metà serata, quando lo aggiungi ti chiediamo se il giro di prima lo riguarda: rispondendo «no» resta a chi c'era.",
      ],
      mock: (
        <>
          <MockScelta />
          <MockCondiviso />
        </>
      ),
    });
  }

  passi.push({
    chiave: "richieste",
    titolo: "Dillo come lo vuoi",
    testo:
      "Ogni voce del carrello ha «+ nota»: «senza cipolla», «poco ghiaccio», «ben cotta». Gli ingredienti a menu diventano scorciatoie, così non devi scrivere.",
    punti: [
      "Tre uguali ma uno diverso? Scegli se la nota vale per tutti o per uno solo.",
      "Dove c'è più di un formato lo scegli tu, e il prezzo cambia di conseguenza.",
      "I prodotti «su richiesta» li descrivi a parole: ci pensa il barman. Se sistema il prezzo, lo vedi aggiornato nel conto.",
    ],
  });

  passi.push({
    chiave: "invio",
    titolo: "Controlla, invia, segui",
    testo: splitBill
      ? "Nel carrello le voci sono raggruppate per persona, con il subtotale di ciascuno. Voce sulla persona sbagliata? Spostala col menù a tendina di fianco, dove trovi anche «Dividi tra…» se quel piatto lo pagate in due. Poi «Invia ordine»."
      : "Nel carrello controlli quantità e note, poi «Invia ordine». Puoi ordinare ancora quante volte vuoi: si aggiunge tutto allo stesso tavolo.",
    punti: [
      "Dopo l'invio l'ordine non si modifica più dal telefono: per una correzione chiedi al personale.",
      "Sotto al menu vedi a che punto è ogni ordine, aggiornato da solo.",
    ],
    mock: (
      <>
        <MockCarrello splitBill={splitBill} />
        <MockStati />
      </>
    ),
  });

  passi.push({
    chiave: "conto",
    titolo: "Il conto, senza sorprese",
    testo: splitBill
      ? "In fondo alla pagina «Quanto paga ciascuno» mostra le stesse cifre che vede la cassa: le tue consumazioni, la tua parte del condiviso" +
        (coperto > 0 ? ", il coperto." : ".") +
        " Si paga alla cassa, ognuno la sua o tutto insieme."
      : "In fondo alla pagina trovi il conto con le stesse cifre che vede la cassa" +
        (coperto > 0 ? ", coperto compreso." : ".") +
        " Si paga alla cassa.",
    punti: [
      "Se il locale annulla una voce o corregge un prezzo, lo trovi scritto lì: niente discussioni al momento di pagare.",
      ...(waiterCall
        ? ["Serve una mano prima? «Chiama il cameriere», in cima alla pagina."]
        : []),
    ],
    mock: splitBill ? <MockConto coperto={coperto} /> : undefined,
  });

  return passi;
}

export default function GuidaTavolo({
  tenantId,
  tableNumber,
  splitBill,
  waiterCall,
  coverChargeCents,
  sessionMinutes,
}: {
  tenantId: string;
  tableNumber: number;
  splitBill: boolean;
  waiterCall: boolean;
  coverChargeCents: number;
  sessionMinutes: number;
}) {
  const [aperta, setAperta] = useState(false);
  const [i, setI] = useState(0);

  const passi = costruisciPassi({
    tableNumber,
    splitBill,
    waiterCall,
    coperto: coverChargeCents,
    minuti: sessionMinutes > 0 ? sessionMinutes : 120,
  });
  const passo = passi[Math.min(i, passi.length - 1)];
  const ultimo = i >= passi.length - 1;

  // Una chiave per locale: chi conosce un menu non conosce l'altro. La versione
  // serve a rimostrare la guida quando cambia davvero qualcosa.
  const chiave = `comanda_guida_${tenantId}_${VERSIONE}`;

  function vista() {
    try {
      localStorage.setItem(chiave, "1");
    } catch {
      // navigazione privata: pazienza, si riaprira' la prossima volta
    }
  }

  function chiudi() {
    vista();
    setAperta(false);
  }

  // Prima scansione su questo telefono: la guida si apre da sola. Dopo, mai
  // piu' da sola.
  useEffect(() => {
    try {
      if (!localStorage.getItem(chiave)) setAperta(true);
    } catch {
      // niente storage: si resta chiusi, il pulsante c'e' comunque
    }
  }, [chiave]);

  // Con il foglio aperto la pagina sotto non deve scorrere.
  useEffect(() => {
    if (!aperta) return;
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") chiudi();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prima;
      window.removeEventListener("keydown", onKey);
    };
  }, [aperta]);

  return (
    <>
      <button
        onClick={() => {
          setI(0);
          setAperta(true);
        }}
        className="flex min-h-11 items-center gap-1.5 rounded-full border bd px-3 text-sm text-neutral-600"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 1.7-2.5 2-2.5 3.5" />
          <path d="M12 17.2h.01" />
        </svg>
        Come funziona
      </button>

      {aperta && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={chiudi}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Come funziona il menu"
            className="mx-auto flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-white text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-neutral-200" />
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                  Guida · {i + 1} di {passi.length}
                </div>
                <button
                  onClick={chiudi}
                  aria-label="Chiudi la guida"
                  className="-mt-2 flex h-9 w-9 shrink-0 items-center justify-center text-neutral-400"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Altezza minima: cambiando passo il foglio non salta su e giu'. */}
            <div className="min-h-[17rem] flex-1 overflow-y-auto px-4 pb-2">
              <h2 className="mt-1 text-xl font-semibold leading-tight">
                {passo.titolo}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                {passo.testo}
              </p>
              {passo.mock}
              {passo.punti && passo.punti.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {passo.punti.map((p) => (
                    <li key={p} className="flex gap-2 text-sm text-neutral-500">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--brand)" }}
                      />
                      <span className="leading-relaxed">{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-3">
              {i > 0 ? (
                <button
                  onClick={() => setI(i - 1)}
                  className="min-h-11 px-1 text-sm text-neutral-500"
                >
                  Indietro
                </button>
              ) : (
                <button
                  onClick={chiudi}
                  className="min-h-11 px-1 text-sm text-neutral-500"
                >
                  Salta
                </button>
              )}

              <div className="flex gap-1.5">
                {passi.map((p, k) => (
                  <button
                    key={p.chiave}
                    onClick={() => setI(k)}
                    aria-label={`Vai al passo ${k + 1}: ${p.titolo}`}
                    aria-current={k === i}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: k === i ? "1.25rem" : "0.375rem",
                      background:
                        k === i ? "var(--brand)" : "var(--border)",
                    }}
                  />
                ))}
              </div>

              <button
                onClick={() => (ultimo ? chiudi() : setI(i + 1))}
                className="min-h-11 rounded-xl bg-[var(--brand)] px-4 text-sm font-medium text-[var(--brand-on)]"
              >
                {ultimo ? "Ordiniamo" : "Avanti"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
