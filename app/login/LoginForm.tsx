"use client";

import { useActionState, useEffect } from "react";
import { login, type LoginState } from "./actions";

const initial: LoginState = { ok: false };

export default function LoginForm({ tenantName }: { tenantName: string }) {
  const [state, formAction, pending] = useActionState(login, initial);

  useEffect(() => {
    if (state.ok) {
      // Navigazione vera: porta con se' il cookie di sessione appena impostato.
      window.location.href = "/dashboard";
    }
  }, [state.ok]);

  return (
    <>
      <h1 className="text-2xl font-medium">{tenantName}</h1>
      <p className="mt-1 text-sm text-neutral-500">Accesso gestione locale</p>

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
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-[var(--brand-on)] disabled:opacity-50"
        >
          {pending ? "Accesso..." : "Entra"}
        </button>
      </form>
    </>
  );
}
