"use client";

import { useTransition, useState } from "react";
import type { EsitoPagamento } from "@/app/dashboard/fatturazione/actions";

// Il bottone che porta il locale a pagare, o a gestire la carta che ha gia'.
//
// Sta nel browser per un motivo preciso: l'indirizzo di Stripe arriva da una
// server action, ma andarci dalla server action rimbalzerebbe al login. Qui
// invece ci si sposta con `window.location`, che e' una navigazione normale.
//
// Fuori da Next: si esce dal sito, quindi niente <Link> e niente router — a
// Stripe ci si va davvero, non si finge una pagina.
export default function PagaConCarta({
  apri,
  collegata,
  disdetto = false,
  fineIl,
}: {
  apri: () => Promise<EsitoPagamento>;
  /** Ha gia' un abbonamento aperto: allora questo bottone porta al portale. */
  collegata: boolean;
  /** Ha disdetto: l'abbonamento c'e' ancora ma ha una data di scadenza. */
  disdetto?: boolean;
  /** Il giorno in cui finisce, gia' scritto per esteso. */
  fineIl?: string;
}) {
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();

  return (
    <div className="mt-0.5">
      {/* Prima il fatto, poi l'azione. Chi apre questa pagina vuole sapere se
          gli parte un addebito da solo o se deve ricordarsi di fare un
          bonifico: e' la domanda vera, e va risposta prima di offrirgli un
          bottone. */}
      <p style={disdetto ? { color: "var(--warn)" } : undefined}>
        {!collegata
          ? "Con bonifico."
          : disdetto
            ? `Disdetto: l'abbonamento finisce il ${fineIl}.`
            : "Addebito automatico sulla carta."}
      </p>

      <button
        type="button"
        className="btn btn-sm mt-2"
        disabled={inCorso}
        onClick={() =>
          avvia(async () => {
            setErrore(null);
            const esito = await apri();
            if (!esito.ok) {
              setErrore(esito.errore);
              return;
            }
            // `replace` e non `href`: dopo aver pagato, il tasto indietro non
            // deve riportare a una pagina di pagamento gia' usata.
            window.location.replace(esito.url);
          })
        }
      >
        {inCorso
          ? "Apro…"
          : collegata
            ? "Gestisci il pagamento"
            : "Collega una carta"}
      </button>

      <p className="mt-1.5 text-xs" style={{ color: "var(--muted)" }}>
        {!collegata
          ? "Cosi' non devi ricordartene ogni mese. Si paga sulla pagina di Stripe: la carta non passa da qui."
          : disdetto
            ? "Fino a quel giorno resta tutto acceso: l'hai gia' pagato."
            : "Da qui cambi la carta o scarichi le ricevute."}
      </p>

      {errore && (
        <p role="status" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
          {errore}
        </p>
      )}
    </div>
  );
}
