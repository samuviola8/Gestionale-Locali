"use client";

import { useActionState, useState } from "react";
import type { EsitoIndirizzoWeb } from "@/app/admin/locali/[id]/actions";

// Il sottodominio del locale, cambiabile ma non per sbaglio.
//
// E' l'unico campo della scheda che ha effetto fuori dal pannello: cambiarlo
// spegne i QR gia' stampati sui tavoli e i link gia' mandati al titolare.
// Sta a parte dall'anagrafica per questo — e chiede conferma dov'e' gia'
// l'occhio, invece di salvare insieme al resto senza che nessuno se ne
// accorga.
export default function IndirizzoWebLocale({
  id,
  slug,
  rootDomain,
  action,
}: {
  id: string;
  slug: string;
  rootDomain: string;
  action: (
    prev: EsitoIndirizzoWeb,
    formData: FormData
  ) => Promise<EsitoIndirizzoWeb>;
}) {
  const [stato, formAction, inCorso] = useActionState<EsitoIndirizzoWeb, FormData>(
    action,
    {}
  );
  const [scritto, setScritto] = useState(slug);
  const [armato, setArmato] = useState(false);

  const cambiato = scritto.trim() !== slug;

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="slug"
          value={scritto}
          onChange={(e) => {
            setScritto(e.target.value);
            setArmato(false);
          }}
          aria-label="Indirizzo web del locale"
          className="input w-48"
        />
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          .{rootDomain}
        </span>

        {armato ? (
          <span className="inline-flex items-center gap-1.5">
            <button
              type="submit"
              disabled={inCorso}
              className="btn btn-sm"
              style={{
                background: "var(--danger)",
                borderColor: "var(--danger)",
                color: "#ffffff",
              }}
            >
              {inCorso ? "Cambio…" : "Confermi? I QR vanno rifatti"}
            </button>
            <button
              type="button"
              onClick={() => setArmato(false)}
              className="btn btn-sm"
            >
              Annulla
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={!cambiato}
            onClick={() => setArmato(true)}
            className="btn btn-sm"
            style={{ opacity: cambiato ? 1 : 0.5 }}
          >
            Cambia indirizzo
          </button>
        )}
      </div>

      {stato.errore && (
        <p className="text-xs" style={{ color: "var(--danger)" }}>
          {stato.errore}
        </p>
      )}
      {stato.fatto && !cambiato && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Adesso il locale risponde su {stato.fatto}.{rootDomain}. I QR dei
          tavoli vanno ristampati dalla dashboard del locale.
        </p>
      )}
      {!stato.errore && !stato.fatto && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          E&apos; il sottodominio da cui si apre il locale, e sta dentro ai QR
          dei tavoli: cambiandolo, quelli stampati non aprono piu&apos; niente e
          vanno rifatti.
        </p>
      )}
    </form>
  );
}
