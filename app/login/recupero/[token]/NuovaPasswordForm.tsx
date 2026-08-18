"use client";

import { useActionState } from "react";
import { impostaNuovaPassword, type NuovaPasswordState } from "../../actions";

const initial: NuovaPasswordState = {};
const campo = "mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2";

export default function NuovaPasswordForm({ token }: { token: string }) {
  const [state, azione, pending] = useActionState(impostaNuovaPassword, initial);

  if (state.fatto) {
    return (
      <div className="mt-8 space-y-4">
        <p className="text-sm">
          Fatto: da adesso entri con la password che hai appena scelto. Le
          sessioni aperte altrove sono state chiuse.
        </p>
        <a
          href="/login"
          className="block w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-center text-[var(--brand-on)]"
        >
          Entra
        </a>
      </div>
    );
  }

  return (
    <form action={azione} className="mt-8 space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-neutral-600">
        Il link vale una volta sola: scegli adesso la password con cui entrerai.
      </p>
      <div>
        <label className="text-sm text-neutral-600">Nuova password</label>
        <input
          name="nuova"
          type="password"
          required
          minLength={8}
          autoFocus
          autoComplete="new-password"
          className={campo}
        />
      </div>
      <div>
        <label className="text-sm text-neutral-600">Ripetila</label>
        <input
          name="ripeti"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={campo}
        />
      </div>
      {state.errore && <p className="text-sm text-red-600">{state.errore}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-[var(--brand-on)] disabled:opacity-50"
      >
        {pending ? "Salvo..." : "Salva la password"}
      </button>
    </form>
  );
}
