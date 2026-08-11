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
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Da quanto aspetta questo tavolo. E' il dato che serve davvero durante il
// servizio: l'orario in cui e' arrivato l'ordine non dice quanto si e' in
// ritardo, i minuti trascorsi si'.
function waitedMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

// Soglie di attesa: sotto i 5 minuti si e' in orario, oltre i 12 e' tardi.
function urgency(min: number): "ok" | "warn" | "danger" {
  if (min >= 12) return "danger";
  if (min >= 5) return "warn";
  return "ok";
}

function waitLabel(min: number): string {
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

export default function OrderQueue({
  advance,
}: {
  advance: (id: string, status: string) => Promise<void>;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // I minuti di attesa devono salire anche quando non arrivano ordini nuovi.
  const [now, setNow] = useState(() => Date.now());

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
    const poll = setInterval(load, 3000);
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await advance(id, status);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loaded && orders.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <div className="text-base font-medium">Nessun ordine in coda</div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          I nuovi ordini compaiono qui da soli, senza ricaricare.
        </p>
      </div>
    );
  }

  // I piu' vecchi in cima: si smaltisce dalla testa della coda.
  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-3">
      {sorted.map((o) => {
        const min = waitedMinutes(o.createdAt, now);
        const level = urgency(min);
        const isNew = o.status === "new";
        const pieces = o.items.reduce((s, i) => s + i.quantity, 0);

        return (
          <article
            key={o.id}
            className="card overflow-hidden"
            style={
              // Filetto laterale colorato: si coglie la priorita' con la coda
              // dell'occhio, senza leggere.
              level === "ok"
                ? undefined
                : {
                    borderLeftWidth: 3,
                    borderLeftColor:
                      level === "danger" ? "var(--danger)" : "var(--warn)",
                  }
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5">
              <div className="flex items-center gap-2.5">
                <span className="text-lg font-semibold">
                  Tavolo {o.tableNumber}
                </span>
                <span
                  className={"badge " + (isNew ? "badge-brand" : "badge-muted")}
                >
                  {isNew ? "Nuovo" : "In preparazione"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className={"badge badge-" + level}>
                  <span className="tnum">{waitLabel(min)}</span>
                  {level === "danger" && " di attesa"}
                </span>
                <span className="tnum text-xs" style={{ color: "var(--muted)" }}>
                  {time(o.createdAt)}
                </span>
              </div>
            </div>

            <ul className="mt-2.5 space-y-1 px-4 text-sm">
              {o.items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span className="tnum font-semibold">{it.quantity}×</span>
                  <span className="flex-1">{it.name}</span>
                  {it.alias && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {it.alias}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            <div
              className="mt-3 flex items-center justify-between gap-3 px-4 py-3"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {pieces} {pieces === 1 ? "pezzo" : "pezzi"}
              </span>
              {isNew ? (
                <button
                  onClick={() => setStatus(o.id, "preparing")}
                  disabled={busy === o.id}
                  className="btn btn-primary btn-sm"
                >
                  {busy === o.id ? "..." : "Inizia a preparare"}
                </button>
              ) : (
                <button
                  onClick={() => setStatus(o.id, "served")}
                  disabled={busy === o.id}
                  className="btn btn-sm"
                >
                  {busy === o.id ? "..." : "Segna come servito"}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
