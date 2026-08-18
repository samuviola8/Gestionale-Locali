"use client";

import { useActionState } from "react";
import Field from "@/components/Field";
import { importaSchede, type EsitoImportUI } from "./actions";

// Importazione della rubrica da un file.
//
// Chi arriva qui una rubrica ce l'ha gia': su un foglio Excel, nell'export del
// gestionale vecchio, nella lista dei contatti del telefono. Ribatterla a mano
// vorrebbe dire non importarla mai, quindi il modulo accetta quello che c'e' —
// virgole o punti e virgola, intestazioni scritte come capita — invece di
// pretendere un formato nostro che nessuno ha.

const iniziale: EsitoImportUI = { aggiunti: 0, aggiornati: 0, saltati: 0 };

function riassunto(e: EsitoImportUI): string {
  const pezzi = [
    e.aggiunti && `${e.aggiunti} ${e.aggiunti === 1 ? "aggiunto" : "aggiunti"}`,
    e.aggiornati &&
      `${e.aggiornati} ${e.aggiornati === 1 ? "aggiornato" : "aggiornati"}`,
    e.saltati && `${e.saltati} ${e.saltati === 1 ? "saltato" : "saltati"}`,
  ].filter(Boolean);
  return pezzi.length ? pezzi.join(", ") + "." : "Non c'era niente da importare.";
}

export default function ImportaRubrica() {
  const [stato, azione, inCorso] = useActionState(importaSchede, iniziale);

  return (
    <form action={azione} className="card space-y-4 p-4">
      <Field
        label="File CSV"
        hint="Da Excel: «Salva con nome» → CSV. Anche il punto e virgola va bene."
      >
        <input
          type="file"
          name="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="input py-1.5 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-sm"
        />
      </Field>

      <Field
        label="Oppure incolla le righe"
        hint="Utile per poche schede, o per copiarle da un foglio già aperto."
      >
        <textarea
          name="testo"
          rows={6}
          placeholder={"nome;telefono;indirizzo;note\nMario Rossi;3331234567;Via Roma 12, 95030 Nicolosi;Citofono rotto"}
          className="input w-full font-mono text-xs"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={inCorso}>
          {inCorso ? "Importo..." : "Importa"}
        </button>
        {stato.errore && (
          <span role="status" className="text-sm" style={{ color: "var(--danger)" }}>
            {stato.errore}
          </span>
        )}
        {stato.fatto && !inCorso && (
          <span role="status" className="text-sm" style={{ color: "var(--ok)" }}>
            {riassunto(stato)}
          </span>
        )}
      </div>

      <div
        className="border-t pt-3 text-xs"
        style={{ borderColor: "var(--border)", color: "var(--muted)" }}
      >
        <p className="font-medium" style={{ color: "var(--text)" }}>
          Come dev&apos;essere fatto il file
        </p>
        <p className="mt-1">
          Una riga per cliente e una prima riga con i nomi delle colonne.
          Riconosciute: <code>nome</code> (o <code>cliente</code>),{" "}
          <code>cognome</code>, <code>telefono</code> (o <code>cellulare</code>),{" "}
          <code>email</code>, <code>indirizzo</code> (o <code>via</code>),{" "}
          <code>civico</code>, <code>cap</code>, <code>citta</code> (o{" "}
          <code>comune</code>), <code>note</code>. Le colonne che non servono si
          possono lasciare fuori.
        </p>
        <p className="mt-1.5">
          Senza intestazione le colonne si leggono in ordine: nome, telefono,
          indirizzo, note.
        </p>
        <p className="mt-1.5">
          Chi c&apos;è già non viene duplicato: si riconosce dal telefono e la
          scheda si aggiorna. Importare due volte lo stesso file è innocuo.
        </p>
      </div>
    </form>
  );
}
