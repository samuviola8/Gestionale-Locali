// Sagome dei prodotti mostrate mentre l'elenco arriva.
//
// Non e' solo decorazione: dice all'operatore "sto caricando" e tiene lo
// spazio, cosi' quando i prodotti compaiono la pagina non sobbalza.
export default function MenuSkeleton({ righe = 6 }: { righe?: number }) {
  return (
    <div
      className="card divide-y"
      style={{ borderColor: "var(--border)" }}
      aria-busy="true"
      aria-label="Caricamento dei prodotti"
    >
      {Array.from({ length: righe }, (_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 p-3"
          style={{
            borderColor: "var(--border)",
            // Le righe piu' in basso sfumano: si legge come una coda che arriva.
            opacity: 1 - i * 0.12,
          }}
        >
          <div className="skeleton h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <div className="skeleton h-3.5 w-2/5 rounded" />
            <div className="skeleton h-3 w-4/5 rounded" />
          </div>
          <div className="skeleton h-9 w-24 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
