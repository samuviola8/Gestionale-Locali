"use client";

import { useEffect, useState } from "react";

type Item = { name: string; quantity: number; alias: string | null };
type Order = {
  id: string;
  tableNumber: number;
  status: string;
  createdAt: string;
  items: Item[];
};

function time(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export default function OrderQueue({
  advance,
}: {
  advance: (id: string, status: string) => Promise<void>;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/orders", { cache: "no-store" });
      const d = await r.json();
      setOrders(d.orders ?? []);
    } catch {
      // rete momentaneamente assente: si riprova al prossimo giro
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function setStatus(id: string, status: string) {
    await advance(id, status);
    load();
  }

  if (loaded && orders.length === 0) {
    return <p className="text-neutral-500">Nessun ordine in coda.</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">Tavolo {o.tableNumber}</div>
            <span
              className={
                "rounded-full px-2.5 py-1 text-xs " +
                (o.status === "new"
                  ? "bg-[var(--brand-50)] text-[var(--brand-text)]"
                  : "bg-neutral-100 text-neutral-600")
              }
            >
              {o.status === "new" ? "Nuovo" : "In preparazione"} · {time(o.createdAt)}
            </span>
          </div>
          <ul className="mt-2 text-sm text-neutral-700">
            {o.items.map((it, i) => (
              <li key={i}>
                {it.quantity}× {it.name}
                {it.alias ? (
                  <span className="text-neutral-400"> · {it.alias}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3">
            {o.status === "new" ? (
              <button
                onClick={() => setStatus(o.id, "preparing")}
                className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm text-[var(--brand-on)]"
              >
                Inizia a preparare
              </button>
            ) : (
              <button
                onClick={() => setStatus(o.id, "served")}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Segna come servito
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
