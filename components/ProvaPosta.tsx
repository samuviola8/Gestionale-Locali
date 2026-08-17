"use client";

import { useState, useTransition } from "react";

// Pulsante che prova la casella e dice com'e' andata, li' dove si sta
// configurando. Un "salva" muto lascia il dubbio fino alla prima prenotazione,
// che e' il momento peggiore per scoprire una password sbagliata.
export default function ProvaPosta({
  prova,
}: {
  prova: () => Promise<{ ok: boolean; messaggio: string }>;
}) {
  const [esito, setEsito] = useState<{ ok: boolean; messaggio: string } | null>(
    null
  );
  const [inCorso, avvia] = useTransition();

  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-sm"
        disabled={inCorso}
        onClick={() =>
          avvia(async () => {
            setEsito(null);
            setEsito(await prova());
          })
        }
      >
        {inCorso ? "Provo…" : "Manda una mail di prova"}
      </button>

      {esito && (
        <p
          role="status"
          className="mt-2 text-xs"
          style={{ color: esito.ok ? "var(--ok)" : "var(--danger)" }}
        >
          {esito.messaggio}
        </p>
      )}
    </div>
  );
}
