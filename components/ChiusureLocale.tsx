"use client";

import { useEffect, useState } from "react";
import { dataISO, festivi, type Chiusura } from "@/lib/orari";

// I giorni in cui il locale non apre, a dispetto degli orari della settimana:
// le feste, le ferie, il giorno che si rompe la cella frigorifera.
//
// Le feste italiane si propongono con un tocco — Pasqua cambia ogni anno e
// nessuno se la ricorda — ma non si spuntano da sole: a Ferragosto molti
// locali lavorano piu' del solito, e chiudere al posto loro sarebbe peggio
// che non offrire la scorciatoia.

function leggibile(iso: string): string {
  const [a, m, g] = iso.split("-").map(Number);
  return new Date(a, m - 1, g).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function ChiusureLocale({
  iniziali,
  salva,
}: {
  iniziali: Chiusura[];
  salva: (chiusure: Chiusura[]) => Promise<void>;
}) {
  const [chiusure, setChiusure] = useState<Chiusura[]>(iniziali);
  const [da, setDa] = useState("");
  const [a, setA] = useState("");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // La data di oggi si legge dopo il primo disegno: calcolarla mentre si rende
  // darebbe un risultato sul server e un altro qui, e React se ne lamenta.
  const [oggi, setOggi] = useState<string | null>(null);
  useEffect(() => setOggi(dataISO(new Date())), []);

  function aggiungi(nuova: Chiusura) {
    setFatto(false);
    setErrore(null);
    setChiusure((prev) =>
      [...prev.filter((c) => !(c.da === nuova.da && c.a === nuova.a)), nuova].sort(
        (x, y) => x.da.localeCompare(y.da)
      )
    );
  }

  function aggiungiScritta() {
    if (!da) {
      setErrore("Serve almeno il giorno di chiusura.");
      return;
    }
    const fine = a || da;
    if (fine < da) {
      setErrore("La fine viene prima dell'inizio.");
      return;
    }
    aggiungi({ da, a: fine, ...(nota.trim() ? { nota: nota.trim() } : {}) });
    setDa("");
    setA("");
    setNota("");
  }

  function togli(i: number) {
    setFatto(false);
    setChiusure((prev) => prev.filter((_, k) => k !== i));
  }

  async function conferma() {
    setSalvando(true);
    setErrore(null);
    try {
      await salva(chiusure);
      setFatto(true);
    } finally {
      setSalvando(false);
    }
  }

  const coperta = (giorno: string) =>
    chiusure.some((c) => c.da <= giorno && giorno <= c.a);

  // Le feste che devono ancora arrivare, di quest'anno e del prossimo: a
  // dicembre servono quelle di gennaio, non quelle passate.
  const anno = oggi ? Number(oggi.slice(0, 4)) : 0;
  const proposte = oggi
    ? [...festivi(anno), ...festivi(anno + 1)]
        .filter((f) => f.data >= oggi && !coperta(f.data))
        .slice(0, 8)
    : [];

  return (
    <div>
      {chiusure.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {chiusure.map((c, i) => (
            <li
              key={`${c.da}-${c.a}-${i}`}
              className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="font-medium">
                {leggibile(c.da)}
                {c.a !== c.da && ` – ${leggibile(c.a)}`}
              </span>
              {c.nota && (
                <span style={{ color: "var(--muted)" }}>· {c.nota}</span>
              )}
              {oggi && c.a < oggi && (
                <span className="badge badge-muted">passata</span>
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
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Dal
          <input
            type="date"
            value={da}
            onChange={(e) => setDa(e.target.value)}
            className="input mt-1 h-10 w-[10rem] text-sm"
          />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Al <span className="opacity-70">(se è più di un giorno)</span>
          <input
            type="date"
            value={a}
            min={da || undefined}
            onChange={(e) => setA(e.target.value)}
            className="input mt-1 h-10 w-[10rem] text-sm"
          />
        </label>
        <label className="min-w-40 flex-1 text-xs" style={{ color: "var(--muted)" }}>
          Perché
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ferie, Natale…"
            maxLength={60}
            className="input mt-1 h-10 text-sm"
          />
        </label>
        <button type="button" onClick={aggiungiScritta} className="btn btn-sm">
          Aggiungi
        </button>
      </div>

      {proposte.length > 0 && (
        <div className="mt-3">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Feste in arrivo — tocca quelle in cui chiudi
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {proposte.map((f) => (
              <button
                key={f.data}
                type="button"
                onClick={() =>
                  aggiungi({ da: f.data, a: f.data, nota: f.nome })
                }
                className="rounded-full border bd px-3 py-1.5 text-xs"
                style={{ color: "var(--muted)" }}
              >
                + {f.nome}{" "}
                <span className="opacity-70">{leggibile(f.data).slice(0, 6)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
          {salvando ? "..." : "Salva le chiusure"}
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
