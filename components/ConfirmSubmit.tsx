"use client";

import { useState } from "react";

// Invio in due tempi per le azioni che non si possono annullare.
//
// Niente window.confirm: e' un dialogo di sistema che interrompe il lavoro e
// su tablet appare fuori posto. Qui il pulsante si "arma" e chiede conferma
// dov'e' gia' l'occhio, restando dentro il form della server action.
export default function ConfirmSubmit({
  label,
  confirmLabel = "Confermi?",
  ariaLabel,
}: {
  label: string;
  confirmLabel?: string;
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        aria-label={ariaLabel}
        className="btn btn-sm"
        style={{ color: "var(--danger)" }}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="submit"
        className="btn btn-sm"
        style={{
          background: "var(--danger)",
          borderColor: "var(--danger)",
          color: "#ffffff",
        }}
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="btn btn-sm">
        Annulla
      </button>
    </span>
  );
}
