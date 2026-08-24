"use client";

import { useState } from "react";

// La richiesta al gestore, in dashboard.
//
// È la testimonianza che vale davvero per la vetrina: un cliente racconta
// com'è stato ordinare, un gestore racconta com'è lavorarci — e a un altro
// gestore interessa la seconda.
//
// Si chiede una volta sola, dopo il primo mese, e si chiude senza rispondere.
// Chi la chiude non se la ritrova domani: torna fra due mesi, e chi risponde
// non la rivede mai più.

export default function ChiediTestimonianza({
  nomeLocale,
  invia,
  rimanda,
}: {
  nomeLocale: string;
  invia: (
    voto: number,
    testo: string,
    firma: string,
    pubblicabile: boolean
  ) => Promise<{ ok: true } | { ok: false; errore: string }>;
  rimanda: () => Promise<void>;
}) {
  const [aperto, setAperto] = useState(false);
  const [chiuso, setChiuso] = useState(false);
  const [voto, setVoto] = useState(0);
  const [testo, setTesto] = useState("");
  const [firma, setFirma] = useState(nomeLocale);
  const [pubblicabile, setPubblicabile] = useState(false);
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  if (chiuso) return null;

  async function salva() {
    if (!voto) {
      setErrore("Tocca una stella.");
      return;
    }
    setInviando(true);
    setErrore(null);
    try {
      const esito = await invia(voto, testo.trim(), firma.trim(), pubblicabile);
      if (!esito.ok) setErrore(esito.errore);
      else setFatto(true);
    } catch {
      setErrore("Non sono riuscito a salvare. Riprova.");
    } finally {
      setInviando(false);
    }
  }

  async function chiudi() {
    setChiuso(true);
    await rimanda();
  }

  if (fatto) {
    return (
      <div className="card p-4 text-sm">
        Grazie davvero. Se la pubblico, esce firmata come hai scritto.
      </div>
    );
  }

  if (!aperto) {
    return (
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm">
          Un mese con Comanda: com&apos;è andata? Due righe mi aiutano a
          spiegarlo a chi non lo conosce.
        </span>
        <button onClick={() => setAperto(true)} className="btn btn-sm">
          Dico la mia
        </button>
        <button onClick={chiudi} className="text-xs underline" style={{ color: "var(--muted)" }}>
          non adesso
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="text-sm font-medium">Com&apos;è lavorarci?</div>
      <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
        Questa è per me, non per i vostri clienti. Anche le cose che non vanno:
        quelle le leggo e basta, e mi servono più delle altre.
      </p>

      <div className="rec-stelle" role="radiogroup" aria-label="Voto per Comanda">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={voto === n}
            aria-label={`${n} ${n === 1 ? "stella" : "stelle"}`}
            onClick={() => setVoto(n)}
            className="rec-stella"
            data-piena={n <= voto ? "si" : "no"}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        maxLength={600}
        rows={3}
        placeholder="Cosa è cambiato da quando lo usate"
        aria-label="La tua testimonianza"
        className="input mt-3"
      />

      <label className="rec-consenso">
        <input
          type="checkbox"
          checked={pubblicabile}
          onChange={(e) => setPubblicabile(e.target.checked)}
        />
        <span>
          Puoi pubblicarla sul sito di Comanda, firmata come scrivo qui sotto.
        </span>
      </label>
      {pubblicabile && (
        <input
          value={firma}
          onChange={(e) => setFirma(e.target.value)}
          maxLength={60}
          placeholder="Come firmarla — «Anna, Trattoria da Anna»"
          aria-label="Come firmare"
          className="input mt-2"
        />
      )}

      <div className="rec-tasti">
        <button
          onClick={salva}
          disabled={inviando}
          className="btn btn-primary btn-sm"
        >
          {inviando ? "..." : "Invia"}
        </button>
        <button onClick={chiudi} className="rec-salta">
          non adesso
        </button>
      </div>

      {errore && (
        <p role="status" className="rec-errore">
          {errore}
        </p>
      )}
    </div>
  );
}
