import type { Problema } from "@/lib/pronto";

// Quello che e' acceso ma non funziona, detto in faccia.
//
// Non e' una checklist da spuntare con calma: e' roba rotta adesso, e sta in
// cima perche' chi apre la dashboard deve inciamparci. Ogni voce dice tre
// cose nell'ordine in cui servono: cosa non funziona, **cosa succede al
// cliente** — che e' quella che fa alzare il telefono — e dove si sistema.

export default function ProblemiLocale({
  problemi,
  compatto = false,
}: {
  problemi: Problema[];
  /** Dentro una pagina di modulo: solo quelli di quella pagina, senza titolo. */
  compatto?: boolean;
}) {
  if (problemi.length === 0) return null;

  const rotti = problemi.filter((p) => p.gravita === "rotto");

  return (
    <section className="space-y-3">
      {!compatto && (
        <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
          {rotti.length > 0
            ? rotti.length === 1
              ? "C'e' una cosa accesa che non funziona"
              : `Ci sono ${rotti.length} cose accese che non funzionano`
            : "Da sistemare quando puoi"}
        </h2>
      )}

      {problemi.map((p) => {
        const rotto = p.gravita === "rotto";
        return (
          <div
            key={p.chiave}
            className="rounded-xl px-4 py-3"
            style={
              rotto
                ? { background: "var(--danger-bg)", color: "var(--danger)" }
                : { background: "var(--warn-bg)", color: "var(--warn)" }
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-[220px] flex-1">
                <div className="text-sm font-semibold">{p.titolo}</div>
                <p className="mt-1 text-sm">{p.effetto}</p>
                <p className="mt-1 text-xs opacity-80">{p.rimedio}</p>
              </div>
              <a
                href={p.href}
                className="btn btn-sm shrink-0"
                style={{
                  border: "1px solid currentColor",
                  color: "inherit",
                  background: "transparent",
                }}
              >
                {p.azione}
              </a>
            </div>
          </div>
        );
      })}
    </section>
  );
}
