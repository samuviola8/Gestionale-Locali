"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  dataISO,
  fasceRitiro,
  giorniDisponibili,
  type Calendario,
} from "@/lib/orari";

// Quando ritira o quando si consegna. Il valore e' "AAAA-MM-GGTHH:MM": serve
// la data e non la sola ora, perche' al telefono capita spesso di prenotare
// per domani, e un orario nudo verrebbe letto come oggi.
//
// Le fasce escono dagli orari di apertura del locale, non da una finestra
// inventata: proporre una consegna a serranda abbassata e' peggio che non
// proporne nessuna.

const SCORCIATOIE = [15, 30, 45, 60, 90];

function etichettaDurata(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

function nomeGiorno(d: Date, oggi: Date): string {
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()).getTime()) /
      86400000
  );
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
}

export default function OraRitiro({
  value,
  onChange,
  etichetta,
  orari,
}: {
  value: string;
  onChange: (v: string) => void;
  etichetta: string;
  orari: Calendario;
}) {
  const [aperto, setAperto] = useState(false);
  // L'ora del client si legge dopo il montaggio: calcolarla nel render darebbe
  // un risultato diverso sul server e in pagina.
  const [adesso, setAdesso] = useState<Date | null>(null);
  const [giornoScelto, setGiornoScelto] = useState<string>("");
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

  const giorni = useMemo(
    () => (adesso ? giorniDisponibili(orari, adesso) : []),
    [orari, adesso]
  );

  const giornoAttivo =
    giorni.find((g) => dataISO(g) === giornoScelto) ?? giorni[0] ?? null;

  const fasce = useMemo(
    () => (adesso && giornoAttivo ? fasceRitiro(orari, giornoAttivo, adesso) : []),
    [orari, giornoAttivo, adesso]
  );

  const senzaOrari = Object.keys(orari.settimana).length === 0;

  // Il valore scelto, spezzato.
  const [dataVal, oraVal] = value.includes("T") ? value.split("T") : ["", ""];
  const quando = value ? new Date(value) : null;
  const mancano =
    quando && adesso
      ? Math.round((quando.getTime() - adesso.getTime()) / 60000)
      : null;

  function scegli(giorno: Date, ora: string) {
    onChange(`${dataISO(giorno)}T${ora}`);
    setAperto(false);
  }

  // "+30 min" vale solo per oggi: e' una scorciatoia sul presente.
  function fraMinuti(m: number) {
    if (!adesso) return;
    const d = new Date(adesso.getTime() + m * 60000);
    const ora = `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
    onChange(`${dataISO(d)}T${ora}`);
    setAperto(false);
  }

  const etichettaScelta = quando
    ? `${nomeGiorno(quando, adesso ?? quando)} ${oraVal}`
    : null;

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
        {etichettaScelta ? (
          <>
            <span className="tnum font-medium">{etichettaScelta}</span>
            {mancano !== null && mancano > 0 && mancano < 24 * 60 && (
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                fra {etichettaDurata(mancano)}
              </span>
            )}
          </>
        ) : (
          <span>{etichetta}</span>
        )}
        {value && (
          // Togliere l'orario dev'essere un gesto solo: molti asporti si
          // ritirano appena pronti.
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
          {senzaOrari ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Gli orari di apertura non sono ancora impostati: senza, non so
              quando potete consegnare. Si mettono in Impostazioni.
            </p>
          ) : (
            <>
              {/* Il giorno prima dell'ora: chi chiama per domani sceglie
                  domani, e le fasce cambiano di conseguenza. */}
              <div className="scroll-x flex gap-1.5">
                {giorni.map((g) => {
                  const k = dataISO(g);
                  const attivo = giornoAttivo && dataISO(giornoAttivo) === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setGiornoScelto(k)}
                      className={
                        "min-h-9 whitespace-nowrap rounded-full px-3 text-xs transition " +
                        (attivo ? "font-medium" : "")
                      }
                      style={
                        attivo
                          ? { background: "var(--brand)", color: "var(--brand-on)" }
                          : { background: "var(--surface-2)", color: "var(--muted)" }
                      }
                    >
                      {nomeGiorno(g, adesso ?? g)}
                    </button>
                  );
                })}
              </div>

              {giornoAttivo && adesso && dataISO(giornoAttivo) === dataISO(adesso) && (
                <>
                  <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                    Fra quanto
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {SCORCIATOIE.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => fraMinuti(m)}
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
                </>
              )}

              <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                {fasce.length ? "Oppure a che ora" : "Nessuna fascia disponibile"}
              </div>
              {fasce.length > 0 && (
                <div className="mt-1.5 grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
                  {fasce.map((f) => {
                    const attivo =
                      giornoAttivo &&
                      dataVal === dataISO(giornoAttivo) &&
                      oraVal === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => giornoAttivo && scegli(giornoAttivo, f)}
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
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => {
              onChange("");
              setAperto(false);
            }}
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
