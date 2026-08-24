"use client";

import { CHANNELS, type Channel } from "@/lib/channels";

// Le pillole che filtrano per provenienza: sala, banco, asporto, domicilio.
//
// Durante il servizio si guarda una cosa per volta — chi impacchetta gli
// asporti non deve scorrere i tavoli — e la stessa fila serve in coda ordini e
// sui conti aperti. Sta qui e non copiata due volte perche' due copie diventano
// due comportamenti diversi al primo ritocco.
//
// Da due canali in su: in un locale che fa solo sala non filtrerebbero niente.
export default function FiltroCanali({
  canali,
  elementi,
  filtro,
  scegli,
}: {
  /** I canali che questo locale ha davvero. */
  canali: Channel[];
  /** Le cose da contare accanto a ogni pillola, prima del filtro. */
  elementi: { channel: string }[];
  filtro: Channel | "tutti";
  scegli: (f: Channel | "tutti") => void;
}) {
  if (canali.length < 2) return null;
  const pillole = CHANNELS.filter((c) => canali.includes(c.key));

  const stile = (attivo: boolean) =>
    attivo
      ? { background: "var(--brand)", color: "var(--brand-on)" }
      : { color: "var(--muted)" };
  const classe = (attivo: boolean) =>
    "rounded-full border px-3 py-1.5 text-xs " + (attivo ? "bd-brand" : "bd");

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => scegli("tutti")}
        aria-pressed={filtro === "tutti"}
        className={classe(filtro === "tutti")}
        style={stile(filtro === "tutti")}
      >
        Tutti
        <span className="tnum ml-1.5 opacity-70">{elementi.length}</span>
      </button>
      {pillole.map((c) => {
        const quanti = elementi.filter((e) => e.channel === c.key).length;
        const attivo = filtro === c.key;
        return (
          <button
            key={c.key}
            onClick={() => scegli(c.key)}
            aria-pressed={attivo}
            className={classe(attivo)}
            style={stile(attivo)}
          >
            {c.label}
            <span className="tnum ml-1.5 opacity-70">{quanti}</span>
          </button>
        );
      })}
    </div>
  );
}
