"use client";

import { useEffect, useState } from "react";

type Line = { name: string; quantity: number; priceCents: number; paid: boolean };
type Alias = { alias: string; items: Line[]; subtotal: number; allPaid: boolean };
type Table = {
  tableNumber: number;
  aliases: Alias[];
  total: number;
  incassato: number;
  hasPending: boolean;
};

function fmt(c: number): string {
  return "€" + (c / 100).toFixed(2).replace(".", ",");
}

export default function BillBoard({
  markAliasPaid,
  closeTable,
}: {
  markAliasPaid: (tableNumber: number, alias: string) => Promise<void>;
  closeTable: (tableNumber: number) => Promise<void>;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmTable, setConfirmTable] = useState<number | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/bills", { cache: "no-store" });
      const d = await r.json();
      setTables(d.tables ?? []);
    } catch {
      // si riprova al prossimo giro
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function incassa(tableNumber: number, alias: string) {
    await markAliasPaid(tableNumber, alias);
    load();
  }

  async function confirmClose(tableNumber: number) {
    setConfirmTable(null);
    await closeTable(tableNumber);
    load();
  }

  function onCloseClick(t: Table) {
    if (t.hasPending) setConfirmTable(t.tableNumber);
    else confirmClose(t.tableNumber);
  }

  if (loaded && tables.length === 0) {
    return <p className="text-neutral-500">Nessun conto aperto.</p>;
  }

  return (
    <div className="space-y-4">
      {tables.map((t) => (
        <div key={t.tableNumber} className="rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">Tavolo {t.tableNumber}</div>
            <div className="text-sm text-neutral-600">
              Incassato {fmt(t.incassato)} / {fmt(t.total)}
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {t.aliases.map((a) => (
              <div key={a.alias} className="rounded-lg border border-neutral-100 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {a.alias} · {fmt(a.subtotal)}
                  </div>
                  {a.allPaid ? (
                    <span className="rounded-full bg-[var(--brand-50)] px-2.5 py-1 text-xs text-[var(--brand-text)]">
                      Pagato
                    </span>
                  ) : (
                    <button
                      onClick={() => incassa(t.tableNumber, a.alias)}
                      className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs text-[var(--brand-on)]"
                    >
                      Incassa
                    </button>
                  )}
                </div>
                <ul className="mt-1 text-sm">
                  {a.items.map((i, idx) => (
                    <li
                      key={idx}
                      className={
                        "flex justify-between " +
                        (i.paid ? "text-neutral-400 line-through" : "text-neutral-600")
                      }
                    >
                      <span>
                        {i.quantity}× {i.name}
                      </span>
                      <span>{fmt(i.priceCents * i.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <button
            onClick={() => onCloseClick(t)}
            className="mt-3 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            {t.incassato >= t.total
              ? "Chiudi tavolo"
              : "Chiudi tavolo (salda il resto)"}
          </button>
          <p className="mt-2 text-xs text-neutral-400">
            Lo scontrino lo emette la cassa.
          </p>
        </div>
      ))}

      {confirmTable !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-5">
            <div className="font-medium">Ordine ancora in corso</div>
            <p className="mt-2 text-sm text-neutral-600">
              Il tavolo {confirmTable} ha ancora un ordine da preparare o in
              preparazione. Chiudendo, l&apos;ordine verra&apos; segnato come
              servito.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmTable(null)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                onClick={() => confirmClose(confirmTable)}
                className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-[var(--brand-on)]"
              >
                Conferma chiusura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
