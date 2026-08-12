"use client";

import { useState } from "react";
import { formatPrice as fmt } from "@/lib/format";

// Grafico a linee disegnato a mano in SVG. Niente librerie: la pagina resta
// leggera, il tema lo decide il CSS e non c'e' niente da caricare da fuori.
//
// Due serie con unita' diverse (euro e persone) hanno ognuna la propria scala:
// altrimenti i coperti sarebbero una riga piatta sul fondo del grafico.

export type PuntoGrafico = {
  etichetta: string;
  incassoCents: number;
  coperti: number;
  ordini: number;
};

const W = 720;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 26, left: 52 };

function percorso(valori: number[], max: number, chiudi: boolean): string {
  const larghezza = W - PAD.left - PAD.right;
  const altezza = H - PAD.top - PAD.bottom;
  const passo = valori.length > 1 ? larghezza / (valori.length - 1) : 0;
  const x = (i: number) => PAD.left + i * passo;
  const y = (v: number) => PAD.top + altezza - (max > 0 ? (v / max) * altezza : 0);

  const punti = valori.map((v, i) => `${x(i)},${y(v)}`);
  if (!chiudi) return "M" + punti.join(" L");
  return (
    `M${x(0)},${PAD.top + altezza} L` +
    punti.join(" L") +
    ` L${x(valori.length - 1)},${PAD.top + altezza} Z`
  );
}

export default function GraficoLinee({
  punti,
  mostraCoperti,
}: {
  punti: PuntoGrafico[];
  mostraCoperti: boolean;
}) {
  const [sopra, setSopra] = useState<number | null>(null);

  if (punti.length === 0) return null;

  const maxIncasso = Math.max(1, ...punti.map((p) => p.incassoCents));
  const maxCoperti = Math.max(1, ...punti.map((p) => p.coperti));
  const larghezza = W - PAD.left - PAD.right;
  const altezza = H - PAD.top - PAD.bottom;
  const passo = punti.length > 1 ? larghezza / (punti.length - 1) : 0;
  const x = (i: number) => PAD.left + i * passo;

  // Poche etichette sull'asse: con trenta giorni si sovrapporrebbero. L'ultima
  // si stampa solo se e' abbastanza lontana da quella prima, altrimenti le due
  // date finiscono una sopra l'altra.
  const ogni = Math.max(1, Math.ceil(punti.length / 8));
  const ultimo = punti.length - 1;
  const stampaUltimo = ultimo % ogni >= ogni / 2 || ultimo % ogni === 0;
  const attivo = sopra ?? ultimo;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: "auto" }}
        role="img"
        aria-label="Incasso per giorno"
        onMouseLeave={() => setSopra(null)}
      >
        {/* Riferimenti orizzontali: senza, le altezze non si leggono. */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + altezza * (1 - f)}
              y2={PAD.top + altezza * (1 - f)}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 8}
              y={PAD.top + altezza * (1 - f) + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted)"
            >
              {fmt(Math.round(maxIncasso * f))}
            </text>
          </g>
        ))}

        <path
          d={percorso(
            punti.map((p) => p.incassoCents),
            maxIncasso,
            true
          )}
          fill="var(--brand)"
          opacity="0.14"
        />
        <path
          d={percorso(
            punti.map((p) => p.incassoCents),
            maxIncasso,
            false
          )}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {mostraCoperti && (
          <path
            d={percorso(
              punti.map((p) => p.coperti),
              maxCoperti,
              false
            )}
            fill="none"
            stroke="var(--ok)"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
        )}

        {punti.map((p, i) => (
          <circle
            key={p.etichetta}
            cx={x(i)}
            cy={
              PAD.top +
              altezza -
              (maxIncasso > 0 ? (p.incassoCents / maxIncasso) * altezza : 0)
            }
            r={i === attivo ? 4 : 2.5}
            fill="var(--brand)"
          />
        ))}

        {punti.map((p, i) =>
          i % ogni === 0 || (i === ultimo && stampaUltimo) ? (
            <text
              key={p.etichetta}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="var(--muted)"
            >
              {p.etichetta}
            </text>
          ) : null
        )}

        {/* Fasce invisibili per il passaggio del mouse: puntare una linea
            sottile e' impossibile, una colonna intera no. */}
        {punti.map((p, i) => (
          <rect
            key={p.etichetta}
            x={x(i) - passo / 2}
            y={PAD.top}
            width={passo || larghezza}
            height={altezza}
            fill="transparent"
            onMouseEnter={() => setSopra(i)}
          />
        ))}

        {sopra !== null && (
          <line
            x1={x(sopra)}
            x2={x(sopra)}
            y1={PAD.top}
            y2={PAD.top + altezza}
            stroke="var(--muted)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      <div
        className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs"
        style={{ color: "var(--muted)" }}
      >
        <span>
          <span className="font-medium" style={{ color: "var(--text)" }}>
            {punti[attivo].etichetta}
          </span>
          {" · "}
          <span className="tnum">{fmt(punti[attivo].incassoCents)}</span>
          {" · "}
          <span className="tnum">{punti[attivo].ordini}</span>{" "}
          {punti[attivo].ordini === 1 ? "ordine" : "ordini"}
          {mostraCoperti && (
            <>
              {" · "}
              <span className="tnum">{punti[attivo].coperti}</span>{" "}
              {punti[attivo].coperti === 1 ? "persona" : "persone"}
            </>
          )}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{ background: "var(--brand)" }}
            />
            incasso
          </span>
          {mostraCoperti && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4"
                style={{
                  background:
                    "repeating-linear-gradient(90deg, var(--ok) 0 4px, transparent 4px 7px)",
                }}
              />
              persone
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
