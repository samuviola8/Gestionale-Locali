import Link from "next/link";
import type { Avvio, PassoAvvio } from "@/lib/avvio";

// Checklist del primo giorno, in cima alla dashboard. Non e' un tutorial da
// leggere: e' l'elenco di cosa manca, coi numeri veri del locale. Sparisce da
// sola quando i passi necessari sono fatti, quindi nessuno deve chiuderla.

function Spunta({ fatto }: { fatto: boolean }) {
  if (fatto) {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--ok-bg)", color: "var(--ok)" }}
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="h-6 w-6 shrink-0 rounded-full"
      style={{ border: "2px dashed var(--border)" }}
      aria-hidden="true"
    />
  );
}

function Passo({ passo, prossimo }: { passo: PassoAvvio; prossimo: boolean }) {
  return (
    <li
      className="flex gap-3 rounded-xl p-3"
      // Il primo passo ancora da fare e' l'unico evidenziato: dice dove
      // ricominciare a chi torna il giorno dopo.
      style={
        prossimo
          ? { background: "var(--brand-50)" }
          : { background: "transparent" }
      }
    >
      <Spunta fatto={passo.fatto} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="text-sm font-medium"
            style={passo.fatto ? { color: "var(--muted)" } : undefined}
          >
            {passo.titolo}
          </span>
          {passo.facoltativo && !passo.fatto && (
            <span className="badge badge-muted">facoltativo</span>
          )}
        </div>
        {!passo.fatto && (
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
            {passo.testo}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {passo.stato}
          </span>
          {!passo.fatto && (
            <Link
              href={passo.href}
              className="text-xs font-medium underline underline-offset-2"
              style={{ color: "var(--brand-text)" }}
            >
              {passo.azione} →
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ChecklistAvvio({ avvio }: { avvio: Avvio }) {
  // Completa: il locale e' operativo e la dashboard torna a essere solo la
  // giornata di lavoro.
  if (avvio.completa) return null;

  const prossimo = avvio.passi.find((p) => !p.fatto && !p.facoltativo);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Prepara il locale</h2>
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          <span className="font-semibold" style={{ color: "var(--text)" }}>
            {avvio.fatti}
          </span>{" "}
          di {avvio.totale}
        </span>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--surface-2)" }}
        role="progressbar"
        aria-valuenow={avvio.fatti}
        aria-valuemin={0}
        aria-valuemax={avvio.totale}
        aria-label="Avanzamento della preparazione"
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${(avvio.fatti / avvio.totale) * 100}%`,
            background: "var(--brand)",
          }}
        />
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        Sparisce da sola quando è tutto pronto.
      </p>

      <ul className="mt-3 space-y-1">
        {avvio.passi.map((p) => (
          <Passo key={p.chiave} passo={p} prossimo={p === prossimo} />
        ))}
      </ul>
    </section>
  );
}
