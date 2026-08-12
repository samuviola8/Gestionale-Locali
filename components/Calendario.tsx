"use client";

import { useEffect, useRef, useState } from "react";

// Calendario per scegliere un intervallo. Sostituisce <input type="date">, che
// ogni browser disegna a modo suo e che al buio si porta dietro l'icona chiara
// e il popup di sistema: due elementi che non seguono il tema del locale.

const GIORNI = ["L", "M", "M", "G", "V", "S", "D"];
const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function daISO(s: string): Date {
  return new Date(s + "T00:00:00");
}

function stessoGiorno(a: Date, b: Date): boolean {
  return iso(a) === iso(b);
}

function breve(s: string): string {
  return daISO(s).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
  });
}

// Griglia di un mese, sempre a settimane intere che partono di lunedi'.
function celleMese(anno: number, mese: number): (Date | null)[] {
  const primo = new Date(anno, mese, 1);
  const vuote = (primo.getDay() + 6) % 7;
  const giorni = new Date(anno, mese + 1, 0).getDate();
  return [
    ...Array.from({ length: vuote }, () => null),
    ...Array.from({ length: giorni }, (_, i) => new Date(anno, mese, i + 1)),
  ];
}

function Mese({
  anno,
  mese,
  da,
  a,
  oggi,
  onPick,
}: {
  anno: number;
  mese: number;
  da: string;
  a: string;
  oggi: Date;
  onPick: (d: Date) => void;
}) {
  const inizio = da ? daISO(da) : null;
  const fine = a ? daISO(a) : null;

  return (
    <div className="w-[15.5rem]">
      <div className="mb-2 text-center text-sm font-medium">
        {MESI[mese]} {anno}
      </div>
      <div
        className="grid grid-cols-7 gap-y-1 text-center text-[11px]"
        style={{ color: "var(--muted)" }}
      >
        {GIORNI.map((g, i) => (
          <span key={i}>{g}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {celleMese(anno, mese).map((d, i) => {
          if (!d) return <span key={i} />;

          const futuro = d > oggi;
          const isInizio = inizio && stessoGiorno(d, inizio);
          const isFine = fine && stessoGiorno(d, fine);
          const dentro = inizio && fine && d > inizio && d < fine;
          const estremo = isInizio || isFine;

          return (
            <button
              key={i}
              type="button"
              disabled={futuro}
              onClick={() => onPick(d)}
              aria-label={d.toLocaleDateString("it-IT", { dateStyle: "long" })}
              // Gli angoli si smussano solo agli estremi: le celle in mezzo
              // restano squadrate, cosi' l'intervallo si legge come una fascia
              // continua invece che come una fila di pillole staccate.
              className={
                "relative h-9 text-[13px] transition disabled:opacity-25 " +
                (estremo ? "font-semibold" : "")
              }
              style={{
                background: estremo
                  ? "var(--brand)"
                  : dentro
                    ? "var(--brand-50)"
                    : "transparent",
                color: estremo
                  ? "var(--brand-on)"
                  : dentro
                    ? "var(--brand-text)"
                    : "var(--text)",
                borderRadius: isInizio && isFine
                  ? "10px"
                  : isInizio
                    ? "10px 0 0 10px"
                    : isFine
                      ? "0 10px 10px 0"
                      : dentro
                        ? "0"
                        : "10px",
                outline:
                  !estremo && !dentro && stessoGiorno(d, oggi)
                    ? "1px solid var(--border)"
                    : undefined,
                outlineOffset: "-1px",
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Calendario({
  da,
  a,
  onApplica,
}: {
  da: string;
  a: string;
  onApplica: (da: string, a: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [inizio, setInizio] = useState(da);
  const [fine, setFine] = useState(a);
  // Si parte dal mese dell'inizio: con un intervallo a cavallo di due mesi,
  // partire dalla fine nasconde meta' della selezione.
  const [mostra, setMostra] = useState(() => daISO(da));
  const box = useRef<HTMLDivElement>(null);
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  // Se il periodo cambia da fuori (un preset), il calendario si riallinea.
  useEffect(() => {
    setInizio(da);
    setFine(a);
    setMostra(daISO(da));
  }, [da, a]);

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

  // Primo tocco: nuovo inizio. Secondo: fine, girando gli estremi se si e'
  // cliccato a ritroso, che e' quello che uno intende.
  function scegli(d: Date) {
    const s = iso(d);
    if (!inizio || (inizio && fine)) {
      setInizio(s);
      setFine("");
      return;
    }
    if (s < inizio) {
      setFine(inizio);
      setInizio(s);
    } else {
      setFine(s);
    }
  }

  const secondo = new Date(mostra.getFullYear(), mostra.getMonth() + 1, 1);
  const completo = inizio && fine;

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setAperto(!aperto)}
        aria-expanded={aperto}
        className="flex min-h-10 items-center gap-2.5 rounded-xl px-3.5 text-sm transition"
        style={{
          border: `1px solid ${aperto ? "var(--brand)" : "var(--border)"}`,
          background: "var(--surface)",
          color: "var(--text)",
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
          style={{ color: "var(--muted)" }}
        >
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="6" />
          <line x1="16" y1="3" x2="16" y2="6" />
        </svg>
        {breve(da)} – {breve(a)}
      </button>

      {aperto && (
        <div
          className="absolute right-0 z-40 mt-2 rounded-2xl p-4 shadow-xl"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            minWidth: "17.5rem",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() =>
                setMostra(
                  new Date(mostra.getFullYear(), mostra.getMonth() - 1, 1)
                )
              }
              aria-label="Mese precedente"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              ‹
            </button>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {completo ? `${breve(inizio)} – ${breve(fine)}` : "Scegli la fine"}
            </span>
            <button
              type="button"
              onClick={() =>
                setMostra(
                  new Date(mostra.getFullYear(), mostra.getMonth() + 1, 1)
                )
              }
              aria-label="Mese successivo"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              ›
            </button>
          </div>

          <div className="flex gap-5">
            <Mese
              anno={mostra.getFullYear()}
              mese={mostra.getMonth()}
              da={inizio}
              a={fine}
              oggi={oggi}
              onPick={scegli}
            />
            {/* Due mesi affiancati dove c'e' spazio: scegliere un intervallo a
                cavallo di due mesi con un pannello solo e' un andirivieni. */}
            <div className="hidden lg:block">
              <Mese
                anno={secondo.getFullYear()}
                mese={secondo.getMonth()}
                da={inizio}
                a={fine}
                oggi={oggi}
                onPick={scegli}
              />
            </div>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAperto(false)}
              className="btn btn-sm"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={!completo}
              onClick={() => {
                setAperto(false);
                onApplica(inizio, fine);
              }}
              className="btn btn-primary btn-sm disabled:opacity-40"
            >
              Applica
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
