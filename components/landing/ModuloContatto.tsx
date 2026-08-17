"use client";

import { useState } from "react";

type Esito = "fermo" | "invio" | "inviato";

export default function ModuloContatto({
  indirizzo,
}: {
  /** Indirizzo mostrato come alternativa se l'invio non riesce. */
  indirizzo: string;
}) {
  const [esito, setEsito] = useState<Esito>("fermo");
  const [errore, setErrore] = useState<string | null>(null);

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (esito === "invio") return;

    const dati = Object.fromEntries(new FormData(e.currentTarget));
    setEsito("invio");
    setErrore(null);

    try {
      const r = await fetch("/api/contatti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dati),
      });
      const risposta = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEsito("fermo");
        setErrore(risposta.errore ?? "Non siamo riusciti a inviare il messaggio.");
        return;
      }
      setEsito("inviato");
    } catch {
      // Rete caduta a meta' invio: la richiesta puo' non essere mai partita.
      setEsito("fermo");
      setErrore("Connessione assente. Riprova fra un momento.");
    }
  }

  if (esito === "inviato") {
    return (
      <div className="lp-vetro p-6 text-center sm:p-8">
        <div className="lp-occhiello">Ricevuto</div>
        <h3 className="lp-display mt-3 text-2xl">Ti scriviamo noi</h3>
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          Il messaggio e&apos; arrivato. Rispondiamo di solito entro un giorno
          lavorativo, all&apos;indirizzo che ci hai lasciato.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={invia} className="lp-vetro p-6 text-left sm:p-7">
      <div className="lp-occhiello">Scrivici</div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Due righe su che locale hai e cosa ti serve. Ti rispondiamo via mail.
      </p>

      <div className="mt-5 grid gap-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="lp-campo">
            <span className="lp-etichetta">Nome</span>
            <input name="nome" className="input" required maxLength={80} autoComplete="name" />
          </label>
          <label className="lp-campo">
            <span className="lp-etichetta">Locale</span>
            <input
              name="locale"
              className="input"
              maxLength={120}
              placeholder="facoltativo"
              autoComplete="organization"
            />
          </label>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <label className="lp-campo">
            <span className="lp-etichetta">Email</span>
            <input
              name="email"
              type="email"
              className="input"
              required
              maxLength={160}
              autoComplete="email"
            />
          </label>
          <label className="lp-campo">
            <span className="lp-etichetta">Telefono</span>
            <input
              name="telefono"
              type="tel"
              className="input"
              maxLength={40}
              placeholder="facoltativo"
              autoComplete="tel"
            />
          </label>
        </div>

        <label className="lp-campo">
          <span className="lp-etichetta">Messaggio</span>
          <textarea
            name="messaggio"
            className="lp-area"
            required
            minLength={10}
            maxLength={2000}
            placeholder="Che locale avete, quanti tavoli, cosa vorreste risolvere."
          />
        </label>

        {/* Trappola per i robot: fuori dallo schermo e fuori dal giro dei tab,
            chi compila col mouse e la tastiera non la incontra mai. */}
        <input
          name="sito"
          className="lp-esca"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
      </div>

      {errore && (
        <p className="mt-4 text-sm" style={{ color: "var(--danger)" }} role="alert">
          {errore} Puoi scrivere a{" "}
          <a href={`mailto:${indirizzo}`} className="underline">
            {indirizzo}
          </a>
          .
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary mt-5 w-full"
        disabled={esito === "invio"}
        style={esito === "invio" ? { opacity: 0.6 } : undefined}
      >
        {esito === "invio" ? "Invio..." : "Invia la richiesta"}
      </button>

      <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
        Usiamo i tuoi dati solo per risponderti a questa richiesta.
      </p>
    </form>
  );
}
