"use client";

import { useState } from "react";
import { GIORNI, inMinuti, type Fascia, type OrariApertura } from "@/lib/orari";

// Editor degli orari. Due fasce per giorno — pranzo e cena — perche' quasi
// ogni ristorante chiude nel mezzo, e un orario continuato direbbe che alle
// 16 si consegna. Chi fa orario unico compila solo la prima.
export default function EditorOrari({
  iniziali,
  salva,
}: {
  iniziali: OrariApertura;
  salva: (orari: OrariApertura) => Promise<void>;
}) {
  const [orari, setOrari] = useState<OrariApertura>(iniziali);
  const [salvando, setSalvando] = useState(false);
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function fascia(g: number, i: number): Fascia {
    return orari[String(g)]?.[i] ?? { da: "", a: "" };
  }

  function cambia(g: number, i: number, campo: "da" | "a", v: string) {
    setFatto(false);
    setErrore(null);
    setOrari((prev) => {
      const lista = [...(prev[String(g)] ?? [])];
      while (lista.length <= i) lista.push({ da: "", a: "" });
      lista[i] = { ...lista[i], [campo]: v };
      return { ...prev, [String(g)]: lista };
    });
  }

  function chiudi(g: number) {
    setFatto(false);
    setOrari((prev) => ({ ...prev, [String(g)]: [] }));
  }

  async function conferma() {
    // Una fascia a meta' e' un errore di battitura, non una scelta: meglio
    // dirlo che salvare un orario che non torna.
    for (let g = 0; g < 7; g++) {
      for (const f of orari[String(g)] ?? []) {
        if (!f.da && !f.a) continue;
        if (!f.da || !f.a) {
          setErrore(`${GIORNI[g]}: manca un orario.`);
          return;
        }
        if (inMinuti(f.a) <= inMinuti(f.da)) {
          setErrore(`${GIORNI[g]}: la chiusura viene prima dell'apertura.`);
          return;
        }
      }
    }

    setSalvando(true);
    setErrore(null);
    try {
      // Le fasce vuote non si salvano: sono righe mai compilate.
      const pulito: OrariApertura = {};
      for (let g = 0; g < 7; g++) {
        const fasce = (orari[String(g)] ?? []).filter((f) => f.da && f.a);
        if (fasce.length) pulito[String(g)] = fasce;
      }
      await salva(pulito);
      setOrari(pulito);
      setFatto(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="mt-3 space-y-1.5">
        {GIORNI.map((nome, g) => {
          const chiuso = (orari[String(g)] ?? []).filter((f) => f.da).length === 0;
          return (
            <div
              key={nome}
              className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="w-20 shrink-0 text-sm">{nome}</span>

              {[0, 1].map((i) => (
                <span key={i} className="flex items-center gap-1">
                  <input
                    type="time"
                    value={fascia(g, i).da}
                    onChange={(e) => cambia(g, i, "da", e.target.value)}
                    aria-label={`${nome}, apertura ${i === 0 ? "pranzo" : "cena"}`}
                    className="input h-9 w-[6.5rem] text-sm"
                  />
                  <span style={{ color: "var(--muted)" }}>–</span>
                  <input
                    type="time"
                    value={fascia(g, i).a}
                    onChange={(e) => cambia(g, i, "a", e.target.value)}
                    aria-label={`${nome}, chiusura ${i === 0 ? "pranzo" : "cena"}`}
                    className="input h-9 w-[6.5rem] text-sm"
                  />
                </span>
              ))}

              {chiuso ? (
                <span className="badge badge-muted ml-auto">Chiuso</span>
              ) : (
                <button
                  type="button"
                  onClick={() => chiudi(g)}
                  className="ml-auto text-xs underline"
                  style={{ color: "var(--muted)" }}
                >
                  chiuso
                </button>
              )}
            </div>
          );
        })}
      </div>

      {errore && (
        <p role="status" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
          {errore}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={conferma}
          disabled={salvando}
          className="btn btn-primary btn-sm"
        >
          {salvando ? "..." : "Salva gli orari"}
        </button>
        {fatto && (
          <span className="text-xs" style={{ color: "var(--ok)" }}>
            Salvato.
          </span>
        )}
      </div>
    </div>
  );
}
