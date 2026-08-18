"use client";

import { useActionState, useEffect } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = { ok: false };

const campo =
  "mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2";

export default function LoginForm({ tenantName }: { tenantName: string }) {
  const [state, formAction, pending] = useActionState(login, initial);

  useEffect(() => {
    if (state.ok) {
      // Navigazione vera: porta con se' il cookie di sessione appena impostato.
      window.location.href = "/dashboard";
    }
  }, [state.ok]);

  // Password superata: resta solo il codice. Email e password spariscono dalla
  // pagina, cosi' non si ricomincia da capo buttando via il codice appena
  // arrivato.
  if (state.sfida) {
    return (
      <>
        <h1 className="text-2xl font-medium">{tenantName}</h1>
        <p className="mt-1 text-sm text-neutral-500">Verifica in due passaggi</p>

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
              className={campo + " text-center tracking-[0.4em]"}
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
          <a href="/login" className="block text-center text-sm text-neutral-500">
            Ricomincia
          </a>
        </form>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-medium">{tenantName}</h1>
      <p className="mt-1 text-sm text-neutral-500">Accesso gestione locale</p>

      <form action={formAction} className="mt-8 space-y-4">
        <div>
          <label className="text-sm text-neutral-600">Email</label>
          <input name="email" type="email" required className={campo} />
        </div>
        <div>
          <label className="text-sm text-neutral-600">Password</label>
          <input name="password" type="password" required className={campo} />
        </div>
        {state.error && (
          <p className="text-sm text-red-600">Email o password non corretti.</p>
        )}
        {state.scaduta && (
          <p className="text-sm text-red-600">
            La password temporanea è scaduta: chiedine un&apos;altra qui sotto.
          </p>
        )}
        {state.senzaCodice && (
          <p className="text-sm text-red-600">
            Non siamo riusciti a mandarti il codice di verifica. Chiedi al
            gestore del servizio di sbloccare l&apos;accesso.
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

      <a
        href="/login/recupero"
        className="mt-4 block text-center text-sm text-neutral-500 hover:text-neutral-800"
      >
        Password dimenticata?
      </a>
    </>
  );
}
