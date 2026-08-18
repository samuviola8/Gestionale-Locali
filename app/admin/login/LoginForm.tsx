"use client";

import { useActionState, useEffect } from "react";
import { adminLogin, type AdminLoginState } from "./actions";

const initial: AdminLoginState = { ok: false };

export default function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(adminLogin, initial);

  useEffect(() => {
    if (state.ok) window.location.href = "/admin";
  }, [state.ok]);

  // Superata la password, il modulo cambia faccia: niente email e password
  // ancora in pagina, solo le sei cifre. Lasciarle lì inviterebbe a
  // ricominciare da capo, e ricominciare da capo butta via il codice appena
  // arrivato.
  if (state.sfida) {
    return (
      <form action={formAction} className="mt-8 space-y-4">
        <input type="hidden" name="token" value={state.sfida.token} />
        <input type="hidden" name="metodo" value={state.sfida.metodo} />
        <p className="text-sm text-neutral-600">
          {state.sfida.avviso ||
            (state.sfida.metodo === "email"
              ? "Scrivi le sei cifre che ti sono arrivate per mail."
              : "Apri l'app di autenticazione e scrivi le sei cifre.")}
        </p>
        <div>
          <label className="text-sm text-neutral-600">Codice</label>
          <input
            name="codice"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            autoFocus
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-center tracking-[0.4em]"
          />
        </div>
        {state.codice && <p className="text-sm text-red-600">{state.codice}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-[var(--brand-on)] disabled:opacity-50"
        >
          {pending ? "Verifico..." : "Entra"}
        </button>
        <a href="/admin/login" className="block text-center text-sm text-neutral-500">
          Ricomincia
        </a>
      </form>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label className="text-sm text-neutral-600">Email</label>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2"
        />
      </div>
      <div>
        <label className="text-sm text-neutral-600">Password</label>
        <input
          name="password"
          type="password"
          required
          className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2"
        />
      </div>
      {state.error && (
        <p className="text-sm text-red-600">Email o password non corretti.</p>
      )}
      {state.scaduta && (
        <p className="text-sm text-red-600">
          La password temporanea è scaduta. Rigenerala dal server con lo script
          <code> scripts/cambia-password-admin.ts</code>.
        </p>
      )}
      {state.senzaCodice && (
        <p className="text-sm text-red-600">
          Il codice di verifica non è partito: controlla la configurazione della
          posta e riprova.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-[var(--brand-on)] disabled:opacity-50"
      >
        {pending ? "Accesso..." : "Entra"}
      </button>
    </form>
  );
}
