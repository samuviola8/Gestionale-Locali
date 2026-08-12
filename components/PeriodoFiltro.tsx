"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Calendario from "@/components/Calendario";

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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ background: "var(--surface-2)" }}
      >
        {PRESET.map((p) => (
          <Link
            key={p.key}
            href={`/dashboard/analytics?p=${p.key}`}
            className={
              "min-h-8 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm transition " +
              (attivo === p.key ? "font-medium shadow-sm" : "")
            }
            style={
              attivo === p.key
                ? { background: "var(--surface)", color: "var(--text)" }
                : { color: "var(--muted)" }
            }
          >
            {p.label}
          </Link>
        ))}
      </div>

      <Calendario
        da={da}
        a={a}
        onApplica={(d, f) =>
          router.push(`/dashboard/analytics?da=${d}&a=${f}`)
        }
      />
    </div>
  );
}
