"use client";

import { useEffect, useState } from "react";

type Item = { name: string; quantity: number; alias: string | null };
type Order = { id: string; status: string; createdAt: string; items: Item[] };

const LABEL: Record<string, string> = {
  new: "Ricevuto",
  preparing: "In preparazione",
  served: "Servito",
};

export default function TableStatus({ tableNumber }: { tableNumber: number }) {
  const [orders, setOrders] = useState<Order[]>([]);

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
    <div className="mt-8 rounded-xl border border-neutral-200 p-4">
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
                    ? { background: "#EAF3DE", color: "#3B6D11" }
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
  );
}
