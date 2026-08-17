"use client";

import { useRouter } from "next/navigation";

// Navigazione per giorno. Le frecce sono la cosa che si usa il 90% delle volte
// — "domani", "ieri" — e il calendario resta li' per il sabato fra tre
// settimane, senza costringere a contare i giorni con le frecce.

function sposta(iso: string, giorni: number): string {
  const d = new Date(`${iso}T12:00`);
  d.setDate(d.getDate() + giorni);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function SceltaGiorno({
  giorno,
  oggi,
  base,
}: {
  giorno: string;
  oggi: string;
  /** Percorso su cui rimbalzare, senza query. */
  base: string;
}) {
  const router = useRouter();
  const vai = (iso: string) => router.push(`${base}?g=${iso}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => vai(sposta(giorno, -1))}
        aria-label="Giorno precedente"
        className="btn btn-sm"
      >
        ‹
      </button>

      <input
        type="date"
        value={giorno}
        aria-label="Vai a una data"
        onChange={(e) => e.target.value && vai(e.target.value)}
        className="input"
        style={{ width: "auto", minHeight: 38 }}
      />

      <button
        type="button"
        onClick={() => vai(sposta(giorno, 1))}
        aria-label="Giorno successivo"
        className="btn btn-sm"
      >
        ›
      </button>

      {giorno !== oggi && (
        <button type="button" onClick={() => vai(oggi)} className="btn btn-sm">
          Oggi
        </button>
      )}
    </div>
  );
}
