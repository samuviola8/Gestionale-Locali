"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Payload } from "@/lib/stampa";
import { formatPrice as fmt } from "@/lib/format";

// La postazione di stampa. Un browser non ha un'identita' propria, quindi quali
// reparti serva lo si decide sul dispositivo e resta li': il PC della pizzeria
// stampa le pizze anche quando ci si logga il titolare, e il portatile in
// ufficio non stampa niente.
const CHIAVE = "comanda_postazione_stampa";

export function leggiPostazione(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = window.localStorage.getItem(CHIAVE);
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
}

export function salvaPostazione(reparti: string[]): void {
  window.localStorage.setItem(CHIAVE, JSON.stringify(reparti));
  window.dispatchEvent(new Event("postazione-cambiata"));
}

function Comanda({ p }: { p: Extract<Payload, { kind: "comanda" }> }) {
  return (
    <div className="foglio">
      <div className="foglio-titolo">{p.reparto ?? "Comanda"}</div>
      <div className="foglio-intestazione">{p.intestazione}</div>
      <div className="foglio-riga-piccola">
        Ordine delle {p.quando}
        {p.dueAt && ` · per le ${p.dueAt}`}
      </div>
      {p.indirizzo && <div className="foglio-riga-piccola">{p.indirizzo}</div>}
      {p.telefono && <div className="foglio-riga-piccola">{p.telefono}</div>}

      <hr />

      {p.voci.map((v, i) => (
        <div key={i} className="foglio-voce">
          <div className="foglio-voce-riga">
            <span className="foglio-qta">{v.quantity}×</span>
            <span>{v.name}</span>
          </div>
          {v.note && <div className="foglio-nota">» {v.note}</div>}
          {v.alias && <div className="foglio-riga-piccola">{v.alias}</div>}
        </div>
      ))}

      {/* L'orario di ritiro si ripete in fondo: e' l'unica cosa che chi
          prepara deve avere ancora davanti quando ha finito di leggere. */}
      {p.dueAt && <div className="foglio-chiusa">Pronto per le {p.dueAt}</div>}
    </div>
  );
}

function Conto({ p }: { p: Extract<Payload, { kind: "conto" }> }) {
  return (
    <div className="foglio">
      <div className="foglio-titolo">{p.intestazione}</div>
      <div className="foglio-riga-piccola">{p.quando}</div>
      <hr />
      {p.righe.map((r, i) => (
        <div key={i} className="foglio-voce-riga foglio-conto-riga">
          <span>{r.descrizione}</span>
          <span>{fmt(r.importoCents)}</span>
        </div>
      ))}
      <hr />
      <div className="foglio-voce-riga foglio-totale">
        <span>Totale</span>
        <span>{fmt(p.totaleCents)}</span>
      </div>
      <div className="foglio-chiusa">{p.nota}</div>
    </div>
  );
}

export default function Stampante({
  segnaStampati,
}: {
  segnaStampati: (ids: string[]) => Promise<void>;
}) {
  const [daStampare, setDaStampare] = useState<
    { id: string; payload: Payload }[]
  >([]);
  const [reparti, setReparti] = useState<string[]>([]);
  const occupato = useRef(false);

  useEffect(() => {
    const leggi = () => setReparti(leggiPostazione());
    leggi();
    window.addEventListener("postazione-cambiata", leggi);
    window.addEventListener("storage", leggi);
    return () => {
      window.removeEventListener("postazione-cambiata", leggi);
      window.removeEventListener("storage", leggi);
    };
  }, []);

  const controlla = useCallback(async () => {
    // Una stampa alla volta: la finestra di sistema e' modale, e partire due
    // volte vorrebbe dire perdere la seconda comanda.
    if (occupato.current || !reparti.length) return;
    try {
      const r = await fetch(
        `/api/print-jobs?reparti=${encodeURIComponent(reparti.join(","))}`,
        { cache: "no-store" }
      );
      const d = await r.json();
      if (d.jobs?.length) setDaStampare(d.jobs);
    } catch {
      // rete assente: si riprova al prossimo giro
    }
  }, [reparti]);

  useEffect(() => {
    controlla();
    const t = setInterval(controlla, 5000);
    return () => clearInterval(t);
  }, [controlla]);

  useEffect(() => {
    if (!daStampare.length || occupato.current) return;
    occupato.current = true;

    // Un attimo perche' il foglio sia davvero nel DOM prima di stampare.
    const t = setTimeout(async () => {
      try {
        window.print();
      } finally {
        await segnaStampati(daStampare.map((j) => j.id));
        setDaStampare([]);
        occupato.current = false;
      }
    }, 250);
    return () => clearTimeout(t);
  }, [daStampare, segnaStampati]);

  if (!daStampare.length) return null;

  return (
    <div className="area-stampa" aria-hidden="true">
      {daStampare.map((j) =>
        j.payload.kind === "comanda" ? (
          <Comanda key={j.id} p={j.payload} />
        ) : (
          <Conto key={j.id} p={j.payload} />
        )
      )}
    </div>
  );
}
