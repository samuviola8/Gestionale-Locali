"use client";

import { useActionState, useEffect } from "react";
import { adminLogin, type AdminLoginState } from "./actions";

const initial: AdminLoginState = { ok: false };

export default function AdminLoginForm() {
  const [state, formAction, pending] = useActionState(adminLogin, initial);

  useEffect(() => {
    if (state.ok) window.location.href = "/admin";
  }, [state.ok]);

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
