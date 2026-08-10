"use client";

import { useState } from "react";

export default function DeleteLocaleButton({
  id,
  name,
  deleteAction,
}: {
  id: string;
  name: string;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
      >
        Elimina locale
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 50,
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-neutral-200 p-5"
            style={{ background: "var(--surface)" }}
          >
            <div className="font-medium">Elimina “{name}”?</div>
            <p className="mt-2 text-sm text-neutral-500">
              Verranno eliminati definitivamente menu, ordini, conti, tavoli e
              account. Operazione irreversibile.
            </p>
            <p className="mt-3 text-sm">
              Scrivi <b>{name}</b> per confermare:
            </p>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <form action={deleteAction}>
                <input type="hidden" name="id" value={id} />
                <button
                  disabled={confirm !== name}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  Elimina definitivamente
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
