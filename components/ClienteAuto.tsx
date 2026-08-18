"use client";

import { useEffect, useRef, useState } from "react";
import type { ClienteRubrica } from "@/lib/rubrica";

// Nome e telefono di chi ordina, con la rubrica sotto.
//
// I due campi stanno nello stesso componente perche' cercano la stessa cosa:
// al telefono chi chiama si presenta col nome, ma chi ha gia' ordinato lo si
// ritrova prima dal numero, e non si sa mai quale dei due arriva per primo.
// Scegliendo dall'elenco si compila tutta la scheda in un colpo — nome,
// telefono, indirizzo, citofono — che e' esattamente il momento in cui, a
// dettarlo di nuovo, si sbaglia il civico.
//
// Resta tutto scrivibile a mano: la rubrica e' un aiuto, non un passaggio
// obbligato. Un cliente nuovo si batte e basta.

type Campo = "nome" | "telefono";

export default function ClienteAuto({
  attiva,
  nome,
  telefono,
  onNome,
  onTelefono,
  onScegli,
}: {
  // Modulo rubrica spento: restano due campi normali, senza chiamate inutili.
  attiva: boolean;
  nome: string;
  telefono: string;
  onNome: (v: string) => void;
  onTelefono: (v: string) => void;
  onScegli: (c: ClienteRubrica) => void;
}) {
  const [risultati, setRisultati] = useState<ClienteRubrica[]>([]);
  const [aperto, setAperto] = useState<Campo | null>(null);
  const [evidenziato, setEvidenziato] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  // Cosa e' arrivato dalla rubrica: serve a non ricercare subito dopo, o
  // scegliendo un cliente l'elenco si riaprirebbe da solo su se stesso.
  const scelto = useRef("");

  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) {
        setAperto(null);
      }
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  // Si cerca su quello che si sta scrivendo, qualunque dei due campi sia.
  const q = (aperto === "telefono" ? telefono : nome).trim();

  useEffect(() => {
    if (!attiva || !aperto || q.length < 2 || q === scelto.current) {
      setRisultati([]);
      return;
    }

    // Un quarto di secondo di pausa: la rubrica e' nostra e non si paga a
    // richiesta, ma una interrogazione per ogni tasto premuto resta sprecata.
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/rubrica?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (!vivo) return;
        setRisultati(d.risultati ?? []);
        setEvidenziato(-1);
      } catch {
        // La rubrica non risponde: si scrive a mano e l'ordine parte lo stesso.
      }
    }, 250);

    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [attiva, aperto, q]);

  function prendi(c: ClienteRubrica) {
    scelto.current = aperto === "telefono" ? c.telefono : c.nome;
    setAperto(null);
    setRisultati([]);
    onScegli(c);
  }

  function tasti(e: React.KeyboardEvent) {
    if (!aperto || !risultati.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEvidenziato((i) => (i + 1) % risultati.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEvidenziato((i) => (i - 1 + risultati.length) % risultati.length);
    } else if (e.key === "Enter" && evidenziato >= 0) {
      e.preventDefault();
      prendi(risultati[evidenziato]);
    } else if (e.key === "Escape") {
      setAperto(null);
    }
  }

  const elenco = attiva && aperto && risultati.length > 0 && (
    <ul
      role="listbox"
      className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl p-1 shadow-xl"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {risultati.map((c, i) => (
        <li key={c.id}>
          <button
            type="button"
            role="option"
            aria-selected={i === evidenziato}
            onMouseEnter={() => setEvidenziato(i)}
            // `onMouseDown` e non `onClick`: il click arriva dopo il blur del
            // campo, e a quel punto l'elenco si e' gia' chiuso sotto il dito.
            onMouseDown={(e) => {
              e.preventDefault();
              prendi(c);
            }}
            className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left"
            style={i === evidenziato ? { background: "var(--brand-50)" } : undefined}
          >
            <span className="flex w-full items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium">{c.nome}</span>
              {c.telefono && (
                <span className="tnum shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                  {c.telefono}
                </span>
              )}
            </span>
            {c.indirizzo && (
              <span className="truncate text-xs" style={{ color: "var(--muted)" }}>
                {c.indirizzo}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-2" ref={box}>
      <div className="relative">
        <input
          value={nome}
          onChange={(e) => {
            scelto.current = "";
            onNome(e.target.value);
          }}
          onFocus={() => attiva && setAperto("nome")}
          onKeyDown={tasti}
          placeholder="Nome di chi ritira"
          aria-label="Nome di chi ritira"
          aria-autocomplete={attiva ? "list" : undefined}
          aria-expanded={attiva ? aperto === "nome" : undefined}
          role={attiva ? "combobox" : undefined}
          className="input h-10 w-full"
        />
        {aperto === "nome" && elenco}
      </div>

      <div className="relative">
        <input
          value={telefono}
          onChange={(e) => {
            scelto.current = "";
            onTelefono(e.target.value);
          }}
          onFocus={() => attiva && setAperto("telefono")}
          onKeyDown={tasti}
          placeholder="Telefono"
          aria-label="Telefono"
          inputMode="tel"
          aria-autocomplete={attiva ? "list" : undefined}
          aria-expanded={attiva ? aperto === "telefono" : undefined}
          role={attiva ? "combobox" : undefined}
          className="input h-10 w-full"
        />
        {aperto === "telefono" && elenco}
      </div>
    </div>
  );
}
