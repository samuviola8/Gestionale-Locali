"use client";

import { useState } from "react";
import { formatKm, formatPrice } from "@/lib/format";
import type { FasciaConsegna } from "@/lib/consegna";

// Le zone di consegna, in righe "fino a X km".
//
// Una riga sola e' il costo fisso, e va benissimo: la maggior parte dei locali
// consegna in paese a tre euro e basta. Le righe in piu' servono a chi esce
// anche dai dintorni, e servono soprattutto a **smettere** di uscire: oltre
// l'ultima non si consegna, ed e' quella la decisione che qui si prende.

// Gli stessi tetti che applica il server (lib/consegna.ts). Qui non servono a
// difendere niente — la difesa e' di la' — ma a dire perche', invece di far
// sparire la riga dopo il salvataggio senza una parola.
const MAX_COSTO = 5000;
const MAX_KM = 50;

function inEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function inCents(v: string): number {
  const n = parseFloat(v.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) ? 0 : Math.round(n * 100);
}

export default function FasceConsegna({
  iniziali,
  gratisSopraIniziale,
  salva,
}: {
  iniziali: FasciaConsegna[];
  gratisSopraIniziale: number;
  // Torna le fasce come sono state scritte davvero: a ripulirle e' il server, e
  // una riga rifiutata deve sparire anche di qui invece di restare a schermo a
  // dire una cosa che a database non c'e'.
  salva: (
    fasce: FasciaConsegna[],
    gratisSopraCents: number
  ) => Promise<FasciaConsegna[]>;
}) {
  const [fasce, setFasce] = useState<FasciaConsegna[]>(iniziali);
  const [gratis, setGratis] = useState(
    gratisSopraIniziale ? inEuro(gratisSopraIniziale) : ""
  );
  const [km, setKm] = useState("");
  const [costo, setCosto] = useState("");
  const [minimo, setMinimo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function aggiungi() {
    setFatto(false);
    const distanza = Math.round(parseFloat(km.replace(",", ".")) * 2) / 2;
    if (!(distanza > 0)) {
      setErrore("Serve fin dove arriva questa fascia, in chilometri.");
      return;
    }
    if (distanza > MAX_KM) {
      setErrore("Oltre i 50 km non è più una consegna.");
      return;
    }
    if (fasce.some((f) => f.kmFino === distanza)) {
      setErrore(`C'è già una fascia che arriva a ${formatKm(distanza)}.`);
      return;
    }
    if (inCents(costo) > MAX_COSTO) {
      setErrore("Una consegna non può costare più di 50 €.");
      return;
    }
    setErrore(null);
    setFasce((prev) =>
      [
        ...prev,
        {
          kmFino: distanza,
          costoCents: inCents(costo),
          minimoCents: inCents(minimo),
        },
      ].sort((a, b) => a.kmFino - b.kmFino)
    );
    setKm("");
    setCosto("");
    setMinimo("");
  }

  function togli(i: number) {
    setFatto(false);
    setFasce((prev) => prev.filter((_, k) => k !== i));
  }

  async function conferma() {
    setSalvando(true);
    setErrore(null);
    try {
      setFasce(await salva(fasce, inCents(gratis)));
      setFatto(true);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      {fasce.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {fasce.map((f, i) => (
            <li
              key={f.kmFino}
              className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="tnum font-medium">
                {i === 0 ? "Fino a" : `Da ${formatKm(fasce[i - 1].kmFino)} a`}{" "}
                {formatKm(f.kmFino)}
              </span>
              <span className="tnum">
                ·{" "}
                {f.costoCents === 0
                  ? "consegna gratis"
                  : formatPrice(f.costoCents)}
              </span>
              {f.minimoCents > 0 && (
                <span className="tnum" style={{ color: "var(--muted)" }}>
                  · minimo {formatPrice(f.minimoCents)}
                </span>
              )}
              <button
                type="button"
                onClick={() => togli(i)}
                className="ml-auto text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                togli
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs" style={{ color: "var(--danger)" }}>
          Nessuna zona: finché non ce n&apos;è almeno una, ogni indirizzo
          risulta fuori zona e a domicilio non si ordina.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Fino a (km)
          <input
            value={km}
            onChange={(e) => setKm(e.target.value)}
            inputMode="decimal"
            placeholder="3"
            className="input tnum mt-1 h-10 w-[6.5rem] text-sm"
          />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Costa
          <input
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            inputMode="decimal"
            placeholder="3,00"
            className="input tnum mt-1 h-10 w-[6.5rem] text-sm"
          />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Minimo d&apos;ordine <span className="opacity-70">(se c&apos;è)</span>
          <input
            value={minimo}
            onChange={(e) => setMinimo(e.target.value)}
            inputMode="decimal"
            placeholder="15,00"
            className="input tnum mt-1 h-10 w-[8rem] text-sm"
          />
        </label>
        <button type="button" onClick={aggiungi} className="btn btn-sm">
          Aggiungi
        </button>
      </div>

      <label
        className="mt-4 block max-w-xs text-xs"
        style={{ color: "var(--muted)" }}
      >
        Consegna gratis sopra{" "}
        <span className="opacity-70">(vuoto = si paga sempre)</span>
        <input
          value={gratis}
          onChange={(e) => {
            setGratis(e.target.value);
            setFatto(false);
          }}
          inputMode="decimal"
          placeholder="30,00"
          className="input tnum mt-1 h-10 text-sm"
        />
      </label>

      {errore && (
        <p
          role="status"
          className="mt-2 text-xs"
          style={{ color: "var(--danger)" }}
        >
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
          {salvando ? "..." : "Salva le zone"}
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
