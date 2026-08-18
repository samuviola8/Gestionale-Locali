"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { IconSegnalazione } from "@/components/icons";
import {
  LUNGHEZZA_MAX,
  LUNGHEZZA_MIN,
  TIPI,
  badgeStato,
  etichettaStato,
  etichettaTipo,
  type SegnalazioneInLista,
} from "@/lib/segnalazioni";

// Il pulsante in fondo alla barra, accanto alla firma di chi mantiene il
// software: chi legge quel nome e' anche chi ha appena visto qualcosa non
// funzionare, e da li' deve poterlo dire senza andare a cercare un indirizzo.
//
// Tre bottoni e un campo di testo, niente di piu': durante il servizio nessuno
// compila un modulo. Pagina, ora, chi e con che dispositivo li mette insieme il
// pannello da solo — sono le cose che altrimenti tocca chiedere dopo, e che
// dopo nessuno ricorda.

type Esito = { ok: boolean; messaggio: string };

function quando(d: Date): string {
  return new Date(d).toLocaleString("it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Segnalazioni({
  invia,
  segnaViste,
  elenco,
  daLeggere,
}: {
  invia: (d: {
    tipo: string;
    testo: string;
    pagina: string;
    browser: string;
  }) => Promise<Esito>;
  segnaViste: () => Promise<void>;
  elenco: SegnalazioneInLista[];
  /** Risposte arrivate e non ancora lette da nessuno del locale. */
  daLeggere: number;
}) {
  const [aperto, setAperto] = useState(false);
  const [tipo, setTipo] = useState<string>("blocco");
  const [testo, setTesto] = useState("");
  const [esito, setEsito] = useState<Esito | null>(null);
  const [inCorso, avvia] = useTransition();
  const path = usePathname();

  // Col pannello aperto la pagina sotto non deve scorrere: la rotellina sopra
  // una finestra che copre tutto deve muovere quello che si sta leggendo, non
  // il menu che c'e' dietro.
  useEffect(() => {
    if (!aperto) return;
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function tasto(e: KeyboardEvent) {
      if (e.key === "Escape") setAperto(false);
    }
    window.addEventListener("keydown", tasto);
    return () => {
      document.body.style.overflow = prima;
      window.removeEventListener("keydown", tasto);
    };
  }, [aperto]);

  function apri() {
    setAperto(true);
    setEsito(null);
    // Aprire il pannello e' gia' aver visto le risposte: sono la prima cosa
    // scritta li' dentro, e chiedere un secondo clic per spegnere il pallino
    // vorrebbe dire lasciarlo acceso per sempre.
    if (daLeggere > 0) avvia(() => segnaViste());
  }

  function manda() {
    avvia(async () => {
      const r = await invia({
        tipo,
        testo,
        pagina: path ?? "",
        browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
      });
      setEsito(r);
      if (r.ok) setTesto("");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={apri}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[var(--surface-2)]"
        style={{ color: "var(--muted)" }}
      >
        <IconSegnalazione />
        <span className="flex-1 text-left">Segnala un problema</span>
        {daLeggere > 0 && (
          <span
            className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-[var(--brand-on)]"
            style={{ background: "var(--brand)" }}
            aria-label={`${daLeggere} risposte da leggere`}
          >
            {daLeggere}
          </span>
        )}
      </button>

      {aperto &&
        // La barra laterale e' `sticky`, e questo la rende un contesto di
        // impilamento a se': da qui dentro nemmeno uno z-index altissimo passa
        // sopra la barra delle categorie del menu, che sta in un contesto
        // fratello piu' avanti nella pagina. Appesa al body, invece, la
        // finestra torna a stare sopra tutto.
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setAperto(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Segnala un problema"
              className="flex max-h-[86vh] w-full max-w-lg flex-col rounded-2xl"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="flex items-start justify-between gap-3 px-5 pb-3 pt-4"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div>
                  <h2 className="text-base font-semibold">Segnala un problema</h2>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    Arriva subito a chi mantiene il gestionale.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAperto(false)}
                  aria-label="Chiudi"
                  className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--muted)" }}
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-3 gap-2">
                  {TIPI.map((t) => {
                    const scelto = t.key === tipo;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTipo(t.key)}
                        aria-pressed={scelto}
                        className="rounded-xl px-2 py-2.5 text-left transition"
                        style={{
                          border: `1px solid ${
                            scelto ? "var(--brand)" : "var(--border)"
                          }`,
                          background: scelto ? "var(--brand-50)" : "var(--surface)",
                          color: scelto ? "var(--brand-text)" : "var(--text)",
                        }}
                      >
                        <span className="block text-sm font-medium">{t.label}</span>
                        <span
                          className="mt-0.5 block text-[11px] leading-tight"
                          style={{ color: "var(--muted)" }}
                        >
                          {t.aiuto}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <textarea
                  className="input mt-3 py-2.5"
                  rows={4}
                  maxLength={LUNGHEZZA_MAX}
                  style={{ minHeight: "96px", resize: "vertical" }}
                  placeholder="Cosa non ha funzionato? Se puoi, scrivi cosa stavi facendo."
                  value={testo}
                  onChange={(e) => setTesto(e.target.value)}
                />
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                  Pagina, ora e dispositivo li allego io: non serve che li scrivi.
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={inCorso || testo.trim().length < LUNGHEZZA_MIN}
                    onClick={manda}
                  >
                    {inCorso ? "Invio…" : "Invia"}
                  </button>
                  {esito && (
                    <p
                      role="status"
                      className="text-xs"
                      style={{ color: esito.ok ? "var(--ok)" : "var(--danger)" }}
                    >
                      {esito.messaggio}
                    </p>
                  )}
                </div>

                {elenco.length > 0 && (
                  <div className="mt-6">
                    <h3
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--muted)" }}
                    >
                      Segnalazioni del locale
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {elenco.map((s) => (
                        <li
                          key={s.id}
                          className="rounded-xl p-3"
                          style={{
                            border: "1px solid var(--border)",
                            background: "var(--bg)",
                          }}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`badge ${badgeStato(s.status)}`}>
                              {etichettaStato(s.status)}
                            </span>
                            <span
                              className="text-[11px]"
                              style={{ color: "var(--muted)" }}
                            >
                              {etichettaTipo(s.kind)} · {quando(s.createdAt)}
                              {s.autore ? ` · ${s.autore}` : ""}
                            </span>
                          </div>
                          <p className="mt-1.5 whitespace-pre-wrap text-sm">
                            {s.message}
                          </p>
                          {s.reply && (
                            // La risposta rientrata e con la barra a sinistra: si
                            // deve vedere a colpo d'occhio che quella riga non
                            // l'ha scritta qualcuno del locale.
                            <div
                              className="mt-2 pl-3"
                              style={{ borderLeft: "2px solid var(--brand)" }}
                            >
                              <div
                                className="text-[11px] font-medium"
                                style={{ color: "var(--brand-text)" }}
                              >
                                Risposta
                                {s.repliedAt ? ` · ${quando(s.repliedAt)}` : ""}
                              </div>
                              <p className="mt-0.5 whitespace-pre-wrap text-sm">
                                {s.reply}
                              </p>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
