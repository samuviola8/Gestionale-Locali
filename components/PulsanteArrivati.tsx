"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// «Sono arrivati», con il controllo che prima non c'era.
//
// La prenotazione dice che il tavolo 1 e' suo alle 20:30. Alle 20:30 pero' al
// tavolo 1 puo' esserci ancora chi ci era prima e non ha chiesto il conto:
// segnarli seduti li' vuol dire due tavolate su un conto solo, e ce ne si
// accorge alla cassa, quando ormai il conto e' mescolato.
//
// Non decide il software: dice cosa c'e' e lascia le due uscite che ha
// davvero chi sta in sala — dargli un altro tavolo, o farli aspettare che
// quello si liberi. Il terzo modo, chiudere il conto di chi c'e' adesso, sta
// scritto perche' e' quello che quasi sempre manca.

type Esito = { ok: true } | { ok: false; motivo: string };

export default function PulsanteArrivati({
  reservationId,
  // Il pannello «Cambia i tavoli» di questa riga: e' li' che si va a dargliene
  // un altro, e riaprirlo da qui evita di farlo cercare.
  pannelloTavoli,
  segna,
}: {
  reservationId: string;
  pannelloTavoli: string;
  segna: (id: string) => Promise<Esito>;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();

  function prova() {
    setMotivo(null);
    avvia(async () => {
      const esito = await segna(reservationId);
      if (esito.ok) {
        router.refresh();
        return;
      }
      setMotivo(esito.motivo);
    });
  }

  function apriTavoli() {
    const el = document.getElementById(pannelloTavoli);
    if (!(el instanceof HTMLDetailsElement)) return;
    el.open = true;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setMotivo(null);
  }

  return (
    <>
      <button className="btn btn-sm" disabled={inCorso} onClick={prova}>
        Sono arrivati
      </button>

      {motivo && (
        <div
          className="mt-2 w-full rounded-xl p-3 text-sm"
          role="alert"
          style={{
            background: "var(--warn-bg)",
            border: "1px solid var(--warn)",
          }}
        >
          <div className="font-medium">Il tavolo non è libero</div>
          <p className="mt-0.5">{motivo}</p>
          <p className="mt-1 text-xs">
            Dagli un altro tavolo, oppure falli aspettare: appena quel conto
            viene chiuso dalla cassa, il tavolo torna libero e puoi segnarli
            arrivati.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" onClick={apriTavoli}>
              Assegna un altro tavolo
            </button>
            <button className="btn btn-sm" onClick={() => setMotivo(null)}>
              Aspettano
            </button>
          </div>
        </div>
      )}
    </>
  );
}
