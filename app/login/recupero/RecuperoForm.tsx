"use client";

import { useActionState } from "react";
import { recuperaPassword, type RecuperoState } from "../actions";

const initial: RecuperoState = {};

export default function RecuperoForm() {
  const [state, azione, pending] = useActionState(recuperaPassword, initial);

  if (state.fatto) {
    return (
      <div className="mt-8 space-y-4">
        <p className="text-sm">
          Se quell&apos;indirizzo è di questo locale, gli abbiamo mandato un
          link per rifare la password. Controlla la posta — anche lo spam — e
          aprilo entro un&apos;ora.
        </p>
        <p className="text-sm text-neutral-500">
          Fino ad allora non è cambiato niente: la tua password è ancora quella
          di prima.
        </p>
        <a
          href="/login"
          className="block w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-center text-[var(--brand-on)]"
        >
          Torna all&apos;accesso
        </a>
      </div>
    );
  }

  return (
    <form action={azione} className="mt-8 space-y-4">
      <p className="text-sm text-neutral-600">
        Scrivi l&apos;indirizzo con cui entri: ti mandiamo un link per
        sceglierne una nuova.
      </p>
      <div>
        <label className="text-sm text-neutral-600">Email</label>
        <input
          name="email"
          type="email"
          required
          autoFocus
          className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2"
        />
      </div>
      {state.errore && <p className="text-sm text-red-600">{state.errore}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[var(--brand)] px-4 py-2.5 text-[var(--brand-on)] disabled:opacity-50"
      >
        {pending ? "Mando..." : "Mandami il link"}
      </button>
      <a href="/login" className="block text-center text-sm text-neutral-500">
        Torna indietro
      </a>
    </form>
  );
}
