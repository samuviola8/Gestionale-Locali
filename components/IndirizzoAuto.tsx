"use client";

import { useEffect, useRef, useState } from "react";
import type { Suggerimento } from "@/lib/indirizzi";

// Campo indirizzo con i suggerimenti mentre si scrive. Resta un campo di testo
// normale: se il servizio non risponde o l'indirizzo non e' in elenco — un
// cascinale, una via nuova — si scrive a mano e la consegna parte lo stesso.
// Bloccare l'ordine su un elenco che non conosce tutto sarebbe peggio del
// problema che risolve.
export default function IndirizzoAuto({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[]>([]);
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(-1);
  const [cercando, setCercando] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // Cosa e' stato scelto dall'elenco: serve a non ricercare subito dopo,
  // altrimenti scegliendo un indirizzo il pannello si riaprirebbe da solo.
  const scelto = useRef("");

  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) {
        setAperto(false);
      }
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3 || q === scelto.current) {
      setSuggerimenti([]);
      return;
    }

    // Mezzo secondo di pausa prima di chiedere: una ricerca per ogni tasto
    // premuto sarebbe una richiesta pagata per ogni lettera.
    let vivo = true;
    const t = setTimeout(async () => {
      setCercando(true);
      try {
        const r = await fetch(`/api/indirizzi?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (!vivo) return;
        setSuggerimenti(d.risultati ?? []);
        setAperto(true);
        setEvidenziato(-1);
      } catch {
        // si scrive a mano
      } finally {
        if (vivo) setCercando(false);
      }
    }, 500);

    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [value]);

  function prendi(s: Suggerimento) {
    scelto.current = s.testo;
    onChange(s.testo);
    setAperto(false);
    setSuggerimenti([]);
  }

  function tasti(e: React.KeyboardEvent) {
    if (!aperto || !suggerimenti.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEvidenziato((i) => (i + 1) % suggerimenti.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEvidenziato(
        (i) => (i - 1 + suggerimenti.length) % suggerimenti.length
      );
    } else if (e.key === "Enter" && evidenziato >= 0) {
      e.preventDefault();
      prendi(suggerimenti[evidenziato]);
    } else if (e.key === "Escape") {
      setAperto(false);
    }
  }

  return (
    <div className="relative" ref={box}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={tasti}
        onFocus={() => suggerimenti.length && setAperto(true)}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={aperto}
        role="combobox"
        className="input h-10 w-full pr-8"
      />

      {cercando && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
          style={{ color: "var(--muted)" }}
          aria-hidden="true"
        >
          …
        </span>
      )}

      {aperto && suggerimenti.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl p-1 shadow-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          {suggerimenti.map((s, i) => (
            <li key={s.testo + i}>
              <button
                type="button"
                role="option"
                aria-selected={i === evidenziato}
                onMouseEnter={() => setEvidenziato(i)}
                onClick={() => prendi(s)}
                className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left"
                style={
                  i === evidenziato
                    ? { background: "var(--brand-50)" }
                    : undefined
                }
              >
                <span className="text-sm font-medium">{s.via}</span>
                {s.dettaglio && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {s.dettaglio}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
