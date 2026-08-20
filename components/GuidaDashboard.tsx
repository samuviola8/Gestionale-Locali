"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { IconAiuto, IconClose } from "@/components/icons";
import { chiaveTab, guidaDelTab, type ContestoGuida } from "@/lib/guide";

// Il "Come funziona" della dashboard, come quello del tavolo ma per chi ci
// lavora dietro. Sta nell'intestazione, quindi c'e' su ogni scheda: quello che
// racconta pero' e' solo la scheda aperta adesso, perche' una guida generale
// del gestionale non la legge nessuno mentre la sala si riempie.
//
// La prima volta che si apre una scheda su quel dispositivo il foglio si apre
// da solo: chi comincia stasera non sa di doverlo cercare. Dalla seconda in
// poi resta dietro al pulsante — un tutorial non lo si legge due volte, ma lo
// si cerca quando ci si blocca.

// Cambiandola, la guida torna a farsi vedere anche a chi l'aveva gia' letta.
// Si alza solo quando cambia qualcosa che vale la pena rileggere.
const VERSIONE = "v1";

export default function GuidaDashboard({
  tenantId,
  modules,
  isOwner,
}: { tenantId: string } & ContestoGuida) {
  const path = usePathname();
  const tab = chiaveTab(path);
  const guida = guidaDelTab(tab, { modules, isOwner });

  const [aperta, setAperta] = useState(false);
  const [i, setI] = useState(0);

  // Una chiave per locale e per scheda: chi conosce la coda ordini non
  // conosce ancora i conti aperti.
  const chiave = `comanda_guida_dash_${tenantId}_${tab}_${VERSIONE}`;

  // Cambiando scheda si riparte dal primo passo, e il foglio della scheda
  // lasciata non deve restare aperto sopra quella nuova.
  useEffect(() => {
    setI(0);
    setAperta(false);
  }, [tab]);

  // Prima volta su questa scheda, da questo dispositivo.
  const haGuida = guida !== null;
  useEffect(() => {
    if (!haGuida) return;
    try {
      if (!localStorage.getItem(chiave)) setAperta(true);
    } catch {
      // navigazione privata o storage pieno: si resta chiusi, il pulsante c'e'
    }
  }, [chiave, haGuida]);

  useEffect(() => {
    if (!aperta) return;

    function segnaVista() {
      try {
        localStorage.setItem(chiave, "1");
      } catch {
        // pazienza: si riaprira' la prossima volta
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        segnaVista();
        setAperta(false);
      }
    }

    // Col foglio aperto la pagina sotto non deve scorrere.
    const prima = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prima;
      window.removeEventListener("keydown", onKey);
    };
  }, [aperta, chiave]);

  if (!guida) return null;

  const passi = guida.passi;
  const passo = passi[Math.min(i, passi.length - 1)];
  const ultimo = i >= passi.length - 1;

  function chiudi() {
    try {
      localStorage.setItem(chiave, "1");
    } catch {
      // vedi sopra
    }
    setAperta(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setI(0);
          setAperta(true);
        }}
        aria-label={`Come funziona: ${guida.titolo}`}
        className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm hover:bg-[var(--surface-2)]"
        style={{ color: "var(--muted)" }}
      >
        <IconAiuto size={18} />
        {/* Da telefono resta la sola icona: accanto a campanella e tema la
            frase intera non ci sta, e mozzata a meta' non dice niente. */}
        <span className="max-sm:sr-only">Come funziona</span>
      </button>

      {aperta &&
        // Appeso al body, non lasciato qui dentro. L'intestazione della
        // dashboard ha il `backdrop-blur`, e un antenato con un filtro
        // diventa il riquadro di riferimento di quello che sta `fixed`:
        // il foglio finiva centrato dentro la striscia alta
        // dell'intestazione invece che nello schermo, cioe' per meta'
        // fuori dalla pagina. Stessa cura gia' usata per le segnalazioni.
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={chiudi}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Come funziona: ${guida.titolo}`}
              className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl text-left sm:rounded-2xl"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pt-3">
                <div
                  className="mx-auto mb-3 h-1 w-10 rounded-full sm:hidden"
                  style={{ background: "var(--border)" }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="text-xs font-medium uppercase tracking-wider"
                    style={{ color: "var(--muted)" }}
                  >
                    {guida.titolo} · {i + 1} di {passi.length}
                  </div>
                  <button
                    type="button"
                    onClick={chiudi}
                    aria-label="Chiudi la guida"
                    className="-mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--muted)" }}
                  >
                    <IconClose size={18} />
                  </button>
                </div>
              </div>

              {/* Altezza minima: cambiando passo il foglio non salta su e giu'. */}
              <div className="min-h-[15rem] flex-1 overflow-y-auto px-5 pb-2">
                <h2 className="mt-1 text-xl font-semibold leading-tight">
                  {passo.titolo}
                </h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "var(--muted)" }}
                >
                  {passo.testo}
                </p>
                {passo.punti && passo.punti.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {passo.punti.map((p) => (
                      <li
                        key={p}
                        className="flex gap-2 text-sm"
                        style={{ color: "var(--muted)" }}
                      >
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

              <div
                className="flex items-center justify-between gap-3 px-5 py-3"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                {i > 0 ? (
                  <button
                    type="button"
                    onClick={() => setI(i - 1)}
                    className="min-h-11 px-1 text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    Indietro
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={chiudi}
                    className="min-h-11 px-1 text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    Salta
                  </button>
                )}

                <div className="flex gap-1.5">
                  {passi.map((p, k) => (
                    <button
                      key={p.titolo}
                      type="button"
                      onClick={() => setI(k)}
                      aria-label={`Vai al passo ${k + 1}: ${p.titolo}`}
                      aria-current={k === i}
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: k === i ? "1.25rem" : "0.375rem",
                        background: k === i ? "var(--brand)" : "var(--border)",
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => (ultimo ? chiudi() : setI(i + 1))}
                  className="btn btn-primary btn-sm min-h-11"
                >
                  {ultimo ? "Ho capito" : "Avanti"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
