"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EsitoAccesso } from "@/app/admin/locali/[id]/actions";

// Gli account di un locale visti dal gestore del servizio.
//
// Serve a rispondere a una telefonata: "non entro piu'". Da qui si rimette la
// password — mandata per mail, o dettata al telefono quando la posta del
// locale non c'e' ancora — e si azzera il secondo fattore di chi ha cambiato
// telefono. La password temporanea si vede una volta sola, qui: a database
// c'e' solo il suo hash, e ricaricando la pagina sparisce.

export type Riga = {
  id: string;
  email: string;
  role: string;
  metodo: string | null;
  daCambiare: boolean;
};

const NOMI: Record<string, string> = {
  totp: "App",
  email: "Mail",
};

export default function AccessiLocale({
  utenti,
  resetta,
  azzera,
}: {
  utenti: Riga[];
  resetta: (userId: string, invia: boolean) => Promise<EsitoAccesso>;
  azzera: (userId: string) => Promise<EsitoAccesso>;
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [esiti, setEsiti] = useState<Record<string, EsitoAccesso>>({});

  const fai = (id: string, f: () => Promise<EsitoAccesso>) =>
    avvia(async () => {
      setEsiti((e) => ({ ...e, [id]: { ok: true, messaggio: "…" } }));
      const r = await f();
      setEsiti((e) => ({ ...e, [id]: r }));
      router.refresh();
    });

  if (utenti.length === 0)
    return (
      <p className="card px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
        Nessun account: questo locale non ha ancora nessuno che possa entrare
        nella dashboard.
      </p>
    );

  return (
    <ul className="card divide-y">
      {utenti.map((u) => {
        const e = esiti[u.id];
        return (
          <li key={u.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium">{u.email}</span>
              <span className="badge badge-muted">
                {u.role === "owner" ? "Titolare" : "Staff"}
              </span>
              {u.metodo ? (
                <span className="badge badge-ok">2FA · {NOMI[u.metodo] ?? u.metodo}</span>
              ) : (
                <span className="badge badge-muted">2FA spenta</span>
              )}
              {u.daCambiare && (
                <span className="badge badge-warn">Password temporanea</span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={inCorso}
                onClick={() => fai(u.id, () => resetta(u.id, true))}
              >
                Reset password e manda la mail
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={inCorso}
                onClick={() => fai(u.id, () => resetta(u.id, false))}
              >
                Reset e mostrala qui
              </button>
              {u.metodo && (
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={inCorso}
                  onClick={() => fai(u.id, () => azzera(u.id))}
                >
                  Azzera la 2FA
                </button>
              )}
            </div>

            {e && (
              <div className="mt-2">
                <p
                  role="status"
                  className="text-xs"
                  style={{ color: e.ok ? "var(--ok)" : "var(--danger)" }}
                >
                  {e.messaggio}
                </p>
                {e.password && (
                  <p className="mt-1 select-all rounded-lg px-3 py-2 font-mono text-sm" style={{ background: "var(--surface-2)" }}>
                    {e.password}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
