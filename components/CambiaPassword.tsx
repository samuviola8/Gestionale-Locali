"use client";

import { useActionState, useEffect } from "react";
import type { Esito } from "@/lib/account";

// Il riquadro del cambio password. Lo stesso per il super-admin e per chi
// gestisce un locale: cambia solo l'azione che gli si passa.

export default function CambiaPassword({
  azione,
  temporanea = false,
  dopo,
}: {
  azione: (prev: Esito | null, fd: FormData) => Promise<Esito>;
  /** Sta entrando con una password ricevuta per mail. */
  temporanea?: boolean;
  /** Dove mandare chi ha finito. Serve alla pagina del primo accesso, che
   *  esiste solo finché c'è qualcosa da sistemare. */
  dopo?: string;
}) {
  const [esito, invia, inCorso] = useActionState(azione, null);

  useEffect(() => {
    if (esito?.ok && dopo) window.location.href = dopo;
  }, [esito, dopo]);

  return (
    <form action={invia} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium" style={{ color: "var(--muted)" }}>
          Password attuale
        </span>
        <input
          name="attuale"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
        {temporanea && (
          <span className="mt-1 block text-xs" style={{ color: "var(--muted)" }}>
            È quella che hai ricevuto per mail.
          </span>
        )}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--muted)" }}>
            Nuova password
          </span>
          <input
            name="nuova"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--muted)" }}>
            Ripetila
          </span>
          <input
            name="ripeti"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
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

      <button className="btn btn-primary btn-sm" disabled={inCorso}>
        {inCorso ? "Salvo…" : "Cambia password"}
      </button>
    </form>
  );
}
