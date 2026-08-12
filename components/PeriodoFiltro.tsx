"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Il periodo sta nell'URL e non nello stato: cosi' una serata interessante si
// puo' mandare a qualcuno con un link, e il tasto indietro funziona.
const PRESET = [
  { key: "oggi", label: "Oggi" },
  { key: "7", label: "7 giorni" },
  { key: "30", label: "30 giorni" },
  { key: "90", label: "90 giorni" },
];

export default function PeriodoFiltro({
  attivo,
  da,
  a,
}: {
  attivo: string;
  da: string;
  a: string;
}) {
  const router = useRouter();
  const [dal, setDal] = useState(da);
  const [al, setAl] = useState(a);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="scroll-x flex gap-2">
        {PRESET.map((p) => (
          <Link
            key={p.key}
            href={`/dashboard/analytics?p=${p.key}`}
            className={
              "min-h-10 whitespace-nowrap rounded-full px-4 py-2 text-sm transition " +
              (attivo === p.key ? "font-medium" : "")
            }
            style={
              attivo === p.key
                ? { background: "var(--brand)", color: "var(--brand-on)" }
                : {
                    background: "var(--surface-2)",
                    color: "var(--muted)",
                  }
            }
          >
            {p.label}
          </Link>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/dashboard/analytics?da=${dal}&a=${al}`);
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Dal
          <input
            type="date"
            value={dal}
            max={al}
            onChange={(e) => setDal(e.target.value)}
            className="input mt-1 h-10 w-40"
          />
        </label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>
          Al
          <input
            type="date"
            value={al}
            min={dal}
            onChange={(e) => setAl(e.target.value)}
            className="input mt-1 h-10 w-40"
          />
        </label>
        <button className="btn btn-sm h-10">Applica</button>
      </form>
    </div>
  );
}
