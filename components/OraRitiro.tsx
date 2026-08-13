"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Scelta dell'ora di ritiro. Non un <input type="time">: al telefono il cliente
// dice "fra mezz'ora" oppure "alle otto e mezza", e sono due gesti diversi.
// Il primo e' una scorciatoia, il secondo una fascia da toccare — trafficare
// con l'orologio di sistema mentre si ha la cornetta in mano non e' nessuno
// dei due.

const SCORCIATOIE = [15, 30, 45, 60, 90];

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// Fra quanto cade un "HH:MM", sapendo che un orario gia' passato vale domani.
function fraQuanto(valore: string, adesso: Date): number {
  const [h, m] = valore.split(":").map(Number);
  const q = new Date(
    adesso.getFullYear(),
    adesso.getMonth(),
    adesso.getDate(),
    h,
    m
  );
  let diff = Math.round((q.getTime() - adesso.getTime()) / 60000);
  if (diff < -60) diff += 24 * 60;
  return diff;
}

function etichettaDurata(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export default function OraRitiro({
  value,
  onChange,
  etichetta,
}: {
  value: string;
  onChange: (v: string) => void;
  etichetta: string;
}) {
  const [aperto, setAperto] = useState(false);
  // L'ora del client si legge dopo il montaggio: calcolarla nel render darebbe
  // un risultato diverso sul server e in pagina.
  const [adesso, setAdesso] = useState<Date | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAdesso(new Date());
    const t = setInterval(() => setAdesso(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!aperto) return;
    function fuori(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) {
        setAperto(false);
      }
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAperto(false);
    }
    document.addEventListener("mousedown", fuori);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuori);
      document.removeEventListener("keydown", esc);
    };
  }, [aperto]);

  // Fasce da un quarto d'ora, dal prossimo quarto in poi: nessuno concorda un
  // ritiro alle 20:37, e offrire i minuti singoli allunga solo l'elenco.
  const fasce = useMemo(() => {
    if (!adesso) return [];
    const primo = new Date(adesso);
    primo.setSeconds(0, 0);
    primo.setMinutes(Math.ceil((primo.getMinutes() + 1) / 15) * 15);
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(primo.getTime() + i * 15 * 60000);
      return hhmm(d);
    });
  }, [adesso]);

  const mancano = adesso && value ? fraQuanto(value, adesso) : null;

  function scegli(v: string) {
    onChange(v);
    setAperto(false);
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setAperto(!aperto)}
        aria-expanded={aperto}
        className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3.5 text-sm transition"
        style={{
          border: `1px solid ${aperto || value ? "var(--brand)" : "var(--border)"}`,
          background: "var(--surface)",
          color: value ? "var(--text)" : "var(--muted)",
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          style={{ color: value ? "var(--brand-text)" : "var(--muted)" }}
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5.5l3.5 2" />
        </svg>
        {value ? (
          <>
            <span className="tnum font-medium">{value}</span>
            {mancano !== null && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {mancano > 0
                  ? `fra ${etichettaDurata(mancano)}`
                  : "adesso"}
              </span>
            )}
          </>
        ) : (
          <span>{etichetta}</span>
        )}
        {value && (
          // Togliere l'orario dev'essere un gesto solo: molti asporti si
          // ritirano appena pronti, e riaprire il pannello per annullare
          // sarebbe un giro inutile.
          <span
            role="button"
            tabIndex={0}
            aria-label="Togli l'orario"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onChange("");
              }
            }}
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-xs"
            style={{ color: "var(--muted)" }}
          >
            ✕
          </span>
        )}
      </button>

      {aperto && (
        <div
          className="absolute left-0 right-0 z-40 mt-2 rounded-2xl p-3 shadow-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Fra quanto
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SCORCIATOIE.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() =>
                  adesso && scegli(hhmm(new Date(adesso.getTime() + m * 60000)))
                }
                className="min-h-9 rounded-full px-3 text-xs transition"
                style={{
                  background: "var(--surface-2)",
                  color: "var(--text)",
                }}
              >
                +{etichettaDurata(m)}
              </button>
            ))}
          </div>

          <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Oppure a che ora
          </div>
          <div className="mt-1.5 grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
            {fasce.map((f) => {
              const attivo = f === value;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => scegli(f)}
                  className={
                    "tnum min-h-9 rounded-lg text-xs transition " +
                    (attivo ? "font-semibold" : "")
                  }
                  style={
                    attivo
                      ? { background: "var(--brand)", color: "var(--brand-on)" }
                      : { background: "var(--surface-2)", color: "var(--text)" }
                  }
                >
                  {f}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scegli("")}
            className="mt-3 w-full rounded-xl py-2 text-xs transition"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          >
            Appena pronto
          </button>
        </div>
      )}
    </div>
  );
}
