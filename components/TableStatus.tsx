"use client";

import { useEffect, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";
import type { BillTable } from "@/lib/bill";

type Item = { name: string; quantity: number; alias: string | null };
type Order = { id: string; status: string; createdAt: string; items: Item[] };

const LABEL: Record<string, string> = {
  new: "Ricevuto",
  preparing: "In preparazione",
  served: "Servito",
};

export default function TableStatus({
  tableNumber,
  splitBill,
}: {
  tableNumber: number;
  splitBill: boolean;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [conto, setConto] = useState<BillTable | null>(null);

  async function load() {
    try {
      const r = await fetch(`/api/table-orders?table=${tableNumber}`, {
        cache: "no-store",
      });
      // Sessione del tavolo scaduta o revocata: ricarico, cosi' compare
      // l'invito a riscansionare il QR invece di dati fermi.
      if (r.status === 401) {
        window.location.reload();
        return;
      }
      const d = await r.json();
      setOrders(d.orders ?? []);
      setConto(d.conto ?? null);
    } catch {
      // si riprova al prossimo giro
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [tableNumber]);

  if (orders.length === 0) return null;

  return (
    <div className="mt-8 space-y-4">
      <div className="rounded-xl border bd p-4">
        <div className="flex items-center gap-2">
          <span className="font-medium">Stato del tavolo</span>
          <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
            aggiornato in tempo reale
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {orders.map((o) => {
            const served = o.status === "served";
            return (
              <li
                key={o.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-neutral-700">
                  {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                </span>
                <span
                  className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs"
                  style={
                    served
                      ? { background: "var(--ok-bg)", color: "var(--ok)" }
                      : { background: "var(--brand-50)", color: "var(--brand-text)" }
                  }
                >
                  {LABEL[o.status] ?? o.status}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Quanto deve ciascuno, con le stesse cifre che vedra' la cassa:
          niente sorprese al momento di pagare. */}
      {conto && conto.people.length > 0 && (
        <div className="rounded-xl border bd p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {splitBill ? "Quanto paga ciascuno" : "Il conto"}
            </span>
            <span className="text-sm text-neutral-500">
              totale <span className="font-semibold">{fmt(conto.total)}</span>
            </span>
          </div>

          <ul className="mt-3 space-y-2.5">
            {conto.people.map((p) => (
              <li key={p.alias}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{p.alias}</span>
                  <span className="flex items-center gap-2">
                    {p.paid && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px]"
                        style={{ background: "var(--ok-bg)", color: "var(--ok)" }}
                      >
                        Pagato
                      </span>
                    )}
                    <span className="font-semibold tabular-nums">
                      {fmt(p.total)}
                    </span>
                  </span>
                </div>

                {/* Le voci che al banco fanno discutere: meglio vederle prima. */}
                <div className="mt-0.5 space-y-0.5 text-xs text-neutral-500">
                  {p.itemsTotal > 0 && (
                    <div className="flex justify-between gap-3">
                      <span>Consumazioni</span>
                      <span className="tabular-nums">{fmt(p.itemsTotal)}</span>
                    </div>
                  )}
                  {p.sharedQuota > 0 && (
                    <div className="flex justify-between gap-3">
                      <span>Parte del condiviso</span>
                      <span className="tabular-nums">{fmt(p.sharedQuota)}</span>
                    </div>
                  )}
                  {p.coverCharge > 0 && (
                    <div className="flex justify-between gap-3">
                      <span>Coperto</span>
                      <span className="tabular-nums">{fmt(p.coverCharge)}</span>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {conto.sharedTotal > 0 && (
            <p className="mt-3 text-xs text-neutral-500">
              Il condiviso ({fmt(conto.sharedTotal)}) è diviso tra{" "}
              {conto.partySize} persone.
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500">
            Si paga alla cassa. Gli importi si aggiornano da soli.
          </p>
        </div>
      )}
    </div>
  );
}
