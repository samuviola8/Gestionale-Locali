"use client";

import { useState } from "react";
import type { ClienteRubrica } from "@/lib/rubrica";
import SchedaCliente from "./SchedaCliente";

// Una riga dell'elenco. La scheda in scrittura nasce solo quando si apre la
// riga: duecento clienti vorrebbero dire duecento moduli montati per guardare
// un elenco, e la pagina si trascinerebbe proprio da chi ha piu' clienti.
export default function RigaCliente({
  cliente,
  ultimoOrdine,
}: {
  cliente: ClienteRubrica;
  // Gia' scritta dal server: formattarla qui darebbe una data diversa fra
  // server e browser, e React se ne lamenta a ragione.
  ultimoOrdine: string;
}) {
  const [aperto, setAperto] = useState(false);

  return (
    <details
      className="disclosure"
      onToggle={(e) => setAperto(e.currentTarget.open)}
    >
      <summary>
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-medium">{cliente.nome}</span>
          {cliente.telefono && (
            <span className="tnum text-sm" style={{ color: "var(--muted)" }}>
              {cliente.telefono}
            </span>
          )}
          {cliente.indirizzo && (
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {cliente.indirizzo}
            </span>
          )}
          {cliente.ordini > 0 && (
            <span className="badge badge-muted">
              {cliente.ordini} {cliente.ordini === 1 ? "ordine" : "ordini"}
              {ultimoOrdine && ` · ${ultimoOrdine}`}
            </span>
          )}
        </span>
      </summary>
      <div className="disclosure-body">
        {aperto && <SchedaCliente cliente={cliente} />}
      </div>
    </details>
  );
}
