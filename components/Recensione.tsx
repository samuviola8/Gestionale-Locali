"use client";

import { useState } from "react";

// «Com'è andata?», chiesto a cose fatte.
//
// Tre schermate corte, in quest'ordine, e l'ordine non è casuale:
//
//   1. le stelle al locale, che è la domanda che riguarda chi legge;
//   2. il grazie, con il link al profilo pubblico — mostrato a **tutti**,
//      qualunque voto abbiano dato: mandarci solo i contenti si chiama review
//      gating ed è vietato da Google e da Trustpilot;
//   3. e solo dopo, piccola e da aprire, la riga su Comanda. È la mia, e sta
//      sotto quella del locale perché è meno importante di quella del locale.
//
// Non c'è niente di obbligatorio: si può chiudere a ogni passo, e chi la
// chiude non se la ritrova davanti al giro dopo.

export type EsitoSalvataggio = { ok: true } | { ok: false; errore: string };

function Stelle({
  voto,
  scegli,
  etichetta,
}: {
  voto: number;
  scegli: (v: number) => void;
  etichetta: string;
}) {
  return (
    <div className="rec-stelle" role="radiogroup" aria-label={etichetta}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={voto === n}
          aria-label={`${n} ${n === 1 ? "stella" : "stelle"}`}
          onClick={() => scegli(n)}
          className="rec-stella"
          data-piena={n <= voto ? "si" : "no"}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function Recensione({
  nomeLocale,
  url,
  dove,
  salva,
  salvaComanda,
  compatto = false,
}: {
  nomeLocale: string;
  /** Il profilo pubblico del locale, se ne ha uno. */
  url: string | null;
  /** Come si chiama: «Google», «Trustpilot». */
  dove: string | null;
  salva: (voto: number, testo: string) => Promise<EsitoSalvataggio>;
  salvaComanda: (
    voto: number,
    testo: string,
    firma: string,
    pubblicabile: boolean
  ) => Promise<EsitoSalvataggio>;
  /** Versione da tavolo: parte chiusa, è una riga sola finché non la si apre. */
  compatto?: boolean;
}) {
  const [aperto, setAperto] = useState(!compatto);
  const [chiuso, setChiuso] = useState(false);
  const [voto, setVoto] = useState(0);
  const [testo, setTesto] = useState("");
  const [inviando, setInviando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);

  // La seconda domanda, quella su Comanda: sta chiusa finché non la si apre.
  const [suComanda, setSuComanda] = useState(false);
  const [votoC, setVotoC] = useState(0);
  const [testoC, setTestoC] = useState("");
  const [firma, setFirma] = useState("");
  const [pubblicabile, setPubblicabile] = useState(false);
  const [fattoC, setFattoC] = useState(false);

  if (chiuso) return null;

  async function invia() {
    if (!voto) {
      setErrore("Tocca una stella.");
      return;
    }
    setInviando(true);
    setErrore(null);
    try {
      const esito = await salva(voto, testo.trim());
      if (!esito.ok) setErrore(esito.errore);
      else setFatto(true);
    } catch {
      setErrore("Non sono riuscito a salvare. Riprova.");
    } finally {
      setInviando(false);
    }
  }

  async function inviaComanda() {
    if (!votoC) {
      setErrore("Tocca una stella.");
      return;
    }
    setInviando(true);
    setErrore(null);
    try {
      const esito = await salvaComanda(
        votoC,
        testoC.trim(),
        firma.trim(),
        pubblicabile
      );
      if (!esito.ok) setErrore(esito.errore);
      else setFattoC(true);
    } catch {
      setErrore("Non sono riuscito a salvare. Riprova.");
    } finally {
      setInviando(false);
    }
  }

  // Al tavolo parte come una riga sola: chi sta mangiando non deve trovarsi
  // un questionario addosso.
  if (!aperto) {
    return (
      <div className="rec-invito">
        <span>Com&apos;è andata?</span>
        <button type="button" onClick={() => setAperto(true)} className="btn btn-sm">
          Dai un voto
        </button>
        <button
          type="button"
          onClick={() => setChiuso(true)}
          className="rec-salta"
          aria-label="Chiudi"
        >
          no, grazie
        </button>
      </div>
    );
  }

  return (
    <section className="rec">
      {!fatto ? (
        <>
          <h2 className="rec-titolo">Com&apos;è andata?</h2>
          <p className="rec-detto">
            Il voto lo legge {nomeLocale}, e serve a loro per capire cosa
            migliorare. Bastano le stelle: il resto se ti va.
          </p>
          <Stelle voto={voto} scegli={setVoto} etichetta={`Voto per ${nomeLocale}`} />
          <textarea
            value={testo}
            onChange={(e) => setTesto(e.target.value)}
            maxLength={600}
            rows={3}
            placeholder="Due righe, se ti va"
            aria-label="Cosa vuoi dire al locale"
            className="input mt-3"
          />
          <div className="rec-tasti">
            <button
              type="button"
              onClick={invia}
              disabled={inviando}
              className="btn btn-primary btn-sm"
            >
              {inviando ? "..." : "Invia"}
            </button>
            <button
              type="button"
              onClick={() => setChiuso(true)}
              className="rec-salta"
            >
              non adesso
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="rec-titolo">Grazie.</h2>
          <p className="rec-detto">
            {voto >= 4
              ? "Fa piacere leggerlo."
              : "Il locale lo legge: è così che le cose si sistemano."}
          </p>

          {/* Il link lo vede chiunque abbia risposto, con qualunque voto. */}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm mt-3"
            >
              Lasciala anche su {dove ?? "internet"}
            </a>
          )}

          {/* La mia, sotto la loro e da aprire. */}
          {!fattoC ? (
            !suComanda ? (
              <button
                type="button"
                onClick={() => setSuComanda(true)}
                className="rec-altra"
              >
                E ordinare da qui, com&apos;è andata?
              </button>
            ) : (
              <div className="rec-comanda">
                <p className="rec-detto">
                  Questa è per <strong>Comanda</strong>, il servizio con cui hai
                  ordinato — non per {nomeLocale}.
                </p>
                <Stelle
                  voto={votoC}
                  scegli={setVotoC}
                  etichetta="Voto per Comanda"
                />
                <textarea
                  value={testoC}
                  onChange={(e) => setTestoC(e.target.value)}
                  maxLength={600}
                  rows={2}
                  placeholder="Com'è stato ordinare?"
                  aria-label="Cosa vuoi dire su Comanda"
                  className="input mt-3"
                />
                {/* Il permesso è una spunta a parte, spenta: pubblicare una
                    frase con sopra un nome è un'altra cosa dallo scriverla. */}
                <label className="rec-consenso">
                  <input
                    type="checkbox"
                    checked={pubblicabile}
                    onChange={(e) => setPubblicabile(e.target.checked)}
                  />
                  <span>
                    Potete pubblicarla sul sito di Comanda, firmata come scrivo
                    qui sotto.
                  </span>
                </label>
                {pubblicabile && (
                  <input
                    value={firma}
                    onChange={(e) => setFirma(e.target.value)}
                    maxLength={60}
                    placeholder="Come firmarla — «Marco», «M. R.»"
                    aria-label="Come firmare la recensione"
                    className="input mt-2"
                  />
                )}
                <div className="rec-tasti">
                  <button
                    type="button"
                    onClick={inviaComanda}
                    disabled={inviando}
                    className="btn btn-sm"
                  >
                    {inviando ? "..." : "Invia"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuComanda(false)}
                    className="rec-salta"
                  >
                    lascia stare
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="rec-detto mt-3">Grazie anche per quella.</p>
          )}
        </>
      )}

      {errore && (
        <p role="status" className="rec-errore">
          {errore}
        </p>
      )}
    </section>
  );
}
