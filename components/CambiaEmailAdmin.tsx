"use client";

import { useActionState } from "react";
import type { Esito } from "@/lib/account";

// Cambio dell'indirizzo con cui entra il super-admin. Chiede la password:
// cambiare l'indirizzo di accesso è cambiare la serratura, e non lo deve poter
// fare chi passa davanti a un portatile lasciato aperto.
export default function CambiaEmailAdmin({
  azione,
  emailAttuale,
}: {
  azione: (prev: Esito | null, fd: FormData) => Promise<Esito>;
  emailAttuale: string;
}) {
  const [esito, invia, inCorso] = useActionState(azione, null);

  return (
    <form action={invia} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--muted)" }}>
            Nuovo indirizzo
          </span>
          <input
            name="email"
            type="email"
            required
            defaultValue={emailAttuale}
            autoComplete="username"
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--muted)" }}>
            Password attuale
          </span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="input"
          />
        </label>
      </div>

      {esito && (
        <p
          role="status"
          className="text-xs"
          style={{ color: esito.ok ? "var(--ok)" : "var(--danger)" }}
        >
          {esito.ok ? (esito.messaggio ?? "Fatto.") : esito.errore}
        </p>
      )}

      <button className="btn btn-sm" disabled={inCorso}>
        {inCorso ? "Salvo…" : "Cambia indirizzo"}
      </button>
    </form>
  );
}
