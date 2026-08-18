"use client";

import { useActionState, useEffect, useRef } from "react";
import Field from "@/components/Field";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import type { ClienteRubrica } from "@/lib/rubrica";
import { cancellaScheda, salvaScheda, type EsitoScheda } from "./actions";

// La scheda di un cliente, in scrittura. E' lo stesso modulo per aggiungere e
// per correggere: i campi sono quelli, e tenerne due versioni vorrebbe dire
// che prima o poi uno dei due si dimentica un campo.

const iniziale: EsitoScheda = {};

// "95030 Nicolosi" tornano CAP e comune. Stanno insieme in un campo solo nel
// resto del programma — e' cosi' che si stampano sulla comanda — ma qui si
// scrivono a mano, e due caselle si compilano meglio di una riga da indovinare.
function spezzaZona(dettaglio: string): { cap: string; citta: string } {
  const m = dettaglio.trim().match(/^(\d{5})\s+(.*)$/);
  return m ? { cap: m[1], citta: m[2] } : { cap: "", citta: dettaglio.trim() };
}

export default function SchedaCliente({
  cliente,
}: {
  // Assente = scheda nuova.
  cliente?: ClienteRubrica;
}) {
  const [stato, azione, inCorso] = useActionState(salvaScheda, iniziale);
  const form = useRef<HTMLFormElement>(null);
  const nuovo = !cliente;
  const zona = spezzaZona(cliente?.dettaglio ?? "");

  // Il modulo di inserimento si svuota dopo un salvataggio riuscito: chi sta
  // battendo la rubrica dal quaderno ne aggiunge dieci di fila, e ripulire i
  // campi a mano ogni volta e' il modo piu' rapido per lasciarci dentro il
  // telefono del cliente precedente.
  useEffect(() => {
    if (nuovo && stato.ok) form.current?.reset();
  }, [nuovo, stato.ok]);

  return (
    <div className="space-y-3">
      <form ref={form} action={azione} className="grid gap-3 sm:grid-cols-2">
        {cliente && <input type="hidden" name="id" value={cliente.id} />}

        <Field label="Nome *">
          <input
            name="nome"
            required
            maxLength={120}
            defaultValue={cliente?.nome ?? ""}
            placeholder="Mario Rossi"
            className="input"
          />
        </Field>
        <Field
          label="Telefono"
          hint="È quello che riconosce il cliente la volta dopo."
        >
          <input
            name="telefono"
            inputMode="tel"
            maxLength={32}
            defaultValue={cliente?.telefono ?? ""}
            placeholder="333 1234567"
            className="input"
          />
        </Field>

        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <Field label="Via">
            <input
              name="via"
              maxLength={160}
              defaultValue={cliente?.via ?? ""}
              placeholder="Via Roma"
              className="input"
            />
          </Field>
          <Field label="Civico">
            <input
              name="civico"
              maxLength={16}
              defaultValue={cliente?.civico ?? ""}
              className="input"
            />
          </Field>
        </div>
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Field label="CAP">
            <input
              name="cap"
              inputMode="numeric"
              maxLength={5}
              defaultValue={zona.cap}
              className="input"
            />
          </Field>
          <Field label="Comune">
            <input
              name="citta"
              maxLength={120}
              defaultValue={zona.citta}
              className="input"
            />
          </Field>
        </div>

        <Field label="Email">
          <input
            name="email"
            type="email"
            maxLength={160}
            defaultValue={cliente?.email ?? ""}
            className="input"
          />
        </Field>
        <Field
          label="Note per la consegna"
          hint="Citofono, piano, il cane: quello che nessuno si ricorda."
        >
          <input
            name="note"
            maxLength={300}
            defaultValue={cliente?.note ?? ""}
            className="input"
          />
        </Field>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button className="btn btn-primary" disabled={inCorso}>
            {inCorso ? "..." : nuovo ? "Aggiungi" : "Salva"}
          </button>
          {stato.errore && (
            <span role="status" className="text-sm" style={{ color: "var(--danger)" }}>
              {stato.errore}
            </span>
          )}
          {stato.ok && !inCorso && (
            <span role="status" className="text-sm" style={{ color: "var(--ok)" }}>
              {nuovo ? "Aggiunto." : "Salvato."}
            </span>
          )}
        </div>
      </form>

      {/* Fuori dal modulo di sopra: i form non si annidano, e l'eliminazione
          non deve viaggiare insieme al salvataggio. */}
      {cliente && (
        <form action={cancellaScheda} className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <input type="hidden" name="id" value={cliente.id} />
          <ConfirmSubmit
            label="Elimina dalla rubrica"
            ariaLabel={`Elimina ${cliente.nome} dalla rubrica`}
          />
        </form>
      )}
    </div>
  );
}
