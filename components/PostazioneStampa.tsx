"use client";

import { useEffect, useState } from "react";
import { leggiPostazione, salvaPostazione } from "@/components/Stampante";

// Quali comande stampa QUESTO dispositivo. Non e' un'impostazione del locale
// ma del singolo computer: il PC in pizzeria stampa le pizze, quello in
// ufficio non stampa niente, e la scelta non deve seguire l'account.
export default function PostazioneStampa({
  reparti,
}: {
  reparti: { id: string; name: string }[];
}) {
  const [scelti, setScelti] = useState<string[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setScelti(leggiPostazione());
    setPronto(true);
  }, []);

  function alterna(id: string) {
    const next = scelti.includes(id)
      ? scelti.filter((x) => x !== id)
      : [...scelti, id];
    setScelti(next);
    salvaPostazione(next);
  }

  const voci = [
    ...reparti,
    { id: "generale", name: "Senza reparto e scontrini del conto" },
  ];

  return (
    <div className="card p-4">
      <div className="text-sm font-medium">Postazione di stampa</div>
      <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
        Cosa stampa questo dispositivo. È una scelta del computer, non
        dell&apos;account: resta anche cambiando utente.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {voci.map((r) => {
          const attivo = pronto && scelti.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => alterna(r.id)}
              aria-pressed={attivo}
              className={
                "min-h-10 rounded-full px-4 text-sm transition " +
                (attivo ? "font-medium" : "")
              }
              style={
                attivo
                  ? { background: "var(--brand)", color: "var(--brand-on)" }
                  : { background: "var(--surface-2)", color: "var(--muted)" }
              }
            >
              {r.name}
            </button>
          );
        })}
      </div>

      {pronto && scelti.length === 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Nessuno selezionato: questo dispositivo non stampa niente.
        </p>
      )}

      {/* Il limite va detto qui, dove uno sta configurando, non scoperto dopo
          davanti alla stampante sbagliata. */}
      <div
        className="mt-4 rounded-xl p-3 text-xs"
        style={{ background: "var(--surface-2)", color: "var(--muted)" }}
      >
        <div className="font-medium" style={{ color: "var(--text)" }}>
          Una finestra, una stampante
        </div>
        <p className="mt-1">
          Il browser non può scegliere la stampante: non esiste un modo per
          farlo da una pagina web. Con{" "}
          <code style={{ color: "var(--text)" }}>--kiosk-printing</code> stampa
          in silenzio, ma sempre sulla <strong>predefinita del computer</strong>.
          Per mandare bar e cucina su due stampanti diverse servono due
          postazioni — due PC, oppure due utenti Windows sullo stesso PC, ognuno
          con la sua stampante predefinita e una sola casella qui sopra accesa.
        </p>
      </div>

      {pronto && scelti.length > 1 && (
        <p className="mt-2 text-xs" style={{ color: "var(--warn)" }}>
          Con più reparti accesi tutto esce dalla stessa stampante, quella
          predefinita di questo computer.
        </p>
      )}
    </div>
  );
}
