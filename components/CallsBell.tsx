"use client";

import { useEffect, useRef, useState } from "react";
import { IconBell } from "@/components/icons";
import { sbloccaAudio, suona } from "@/lib/suoni";

type Call = { id: string; tableNumber: number; createdAt: string };

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "ora";
  return mins + " min fa";
}

export default function CallsBell({
  resolveCall,
  suono,
  lampeggia,
}: {
  resolveCall: (id: string) => Promise<void>;
  // Come il locale ha scelto di farsi avvisare.
  suono: string;
  lampeggia: boolean;
}) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Le chiamate gia' viste da questo schermo. Il suono e' per quelle nuove:
  // ripeterlo a ogni giro di lettura, ogni tre secondi, finche' qualcuno non
  // la prende, sarebbe un allarme antifurto.
  const viste = useRef<Set<string> | null>(null);
  // Il suono si legge da un riferimento: la lettura riparte ogni tre secondi
  // con la funzione di quel momento, e senza questo continuerebbe a suonare
  // quello scelto quando la pagina si e' aperta.
  const suonoRef = useRef(suono);
  suonoRef.current = suono;

  async function load() {
    try {
      const r = await fetch("/api/calls", { cache: "no-store" });
      const d = await r.json();
      const arrivate: Call[] = d.calls ?? [];
      setCalls(arrivate);

      // Alla prima lettura si prende nota e basta: le chiamate gia' in coda
      // non sono "arrivate adesso", e chi ricarica la pagina non deve
      // sentirsele suonare tutte.
      if (viste.current === null) {
        viste.current = new Set(arrivate.map((c) => c.id));
        return;
      }
      const nuove = arrivate.filter((c) => !viste.current!.has(c.id));
      viste.current = new Set(arrivate.map((c) => c.id));
      if (nuove.length) suona(suonoRef.current);
    } catch {
      // si riprova al prossimo giro
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  // I browser non suonano niente finche' l'utente non ha toccato la pagina.
  // Al primo tocco si apre la strada, una volta sola: cosi' la chiamata che
  // arriva mezz'ora dopo si sente.
  useEffect(() => {
    function primoTocco() {
      sbloccaAudio();
    }
    window.addEventListener("pointerdown", primoTocco, { once: true });
    window.addEventListener("keydown", primoTocco, { once: true });
    return () => {
      window.removeEventListener("pointerdown", primoTocco);
      window.removeEventListener("keydown", primoTocco);
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function resolve(id: string) {
    await resolveCall(id);
    load();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Chiamate ai tavoli"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border bd"
      >
        <span className={lampeggia && calls.length > 0 ? "campanella-viva" : ""}>
          <IconBell />
        </span>
        {calls.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {calls.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border bd shadow-lg"
          style={{ background: "var(--surface)" }}
        >
          <div className="border-b border-neutral-200 px-3 py-2 text-sm font-medium">
            Chiamate al tavolo
          </div>
          {calls.length === 0 ? (
            <div className="px-3 py-5 text-center text-sm text-neutral-500">
              Nessuna chiamata.
            </div>
          ) : (
            <ul className="max-h-72 overflow-auto p-1">
              {calls.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm"
                >
                  <span>
                    Tavolo {c.tableNumber}{" "}
                    <span className="text-neutral-400">· {timeAgo(c.createdAt)}</span>
                  </span>
                  <button
                    onClick={() => resolve(c.id)}
                    className="rounded-lg bg-[var(--brand)] px-2.5 py-1 text-xs text-[var(--brand-on)]"
                  >
                    Fatto
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
