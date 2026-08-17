"use client";

import { useEffect, useRef, useState } from "react";
import {
  civicoScritto,
  componiIndirizzo,
  sembraAvereCivico,
  type Suggerimento,
} from "@/lib/indirizzi";

// Indirizzo di consegna: via con i suggerimenti, civico in un campo suo.
//
// Il civico sta a parte perche' e' la cosa che si perde piu' facilmente ed e'
// quella senza cui il fattorino gira a vuoto. Con un campo solo, scegliendo
// "Via Roma" dall'elenco il campo diventa "Via Roma, 95056 Sant'Agata" e il
// numero non ha piu' dove andare: chi lo aveva gia' scritto se lo vede
// cancellare, chi non l'aveva scritto non si accorge che manca.
//
// Resta tutto scrivibile a mano: se il servizio non risponde o l'indirizzo non
// e' in elenco — un cascinale, una via nuova — si batte e la consegna parte.
export default function IndirizzoAuto({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [via, setVia] = useState("");
  const [civico, setCivico] = useState("");
  const [dettaglio, setDettaglio] = useState("");
  const [suggerimenti, setSuggerimenti] = useState<Suggerimento[]>([]);
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(-1);
  const [cercando, setCercando] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const campoCivico = useRef<HTMLInputElement>(null);
  // Cosa e' arrivato dall'elenco: serve a non ricercare subito dopo, o
  // scegliendo un indirizzo il pannello si riaprirebbe da solo.
  const scelto = useRef("");
  // Se il numero nel campo l'ha battuto una persona nel suo campo. Quello che
  // arriva dall'elenco o dalla riga della via appartiene all'indirizzo scelto e
  // decade insieme a lui; quello scritto a mano no, e cancellarlo vorrebbe dire
  // farlo riscrivere.
  const civicoAMano = useRef(false);

  // Il genitore tiene una stringa sola: qui si ricompone a ogni pezzo.
  useEffect(() => {
    const composto = componiIndirizzo(via, civico, dettaglio);
    if (composto !== value) onChange(composto);
    // Solo i pezzi: rientrare su `value` rimetterebbe in moto il ciclo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [via, civico, dettaglio]);

  // Svuotamento dal genitore (ordine inviato): si azzerano anche i pezzi.
  useEffect(() => {
    if (value === "") {
      setVia("");
      setCivico("");
      setDettaglio("");
      scelto.current = "";
      civicoAMano.current = false;
    }
  }, [value]);

  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) {
        setAperto(false);
      }
    }
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, []);

  useEffect(() => {
    const q = via.trim();
    if (q.length < 3 || q === scelto.current) {
      setSuggerimenti([]);
      return;
    }

    // Mezzo secondo di pausa prima di chiedere: una ricerca per ogni tasto
    // premuto sarebbe una richiesta pagata per ogni lettera.
    let vivo = true;
    const t = setTimeout(async () => {
      setCercando(true);
      try {
        const r = await fetch(`/api/indirizzi?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        const d = await r.json();
        if (!vivo) return;
        setSuggerimenti(d.risultati ?? []);
        setAperto(true);
        setEvidenziato(-1);
      } catch {
        // si scrive a mano
      } finally {
        if (vivo) setCercando(false);
      }
    }, 500);

    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [via]);

  function cambiaVia(v: string) {
    setVia(v);
    if (v.trim() === scelto.current) return;

    // Ritoccando la via, quello che era arrivato con l'indirizzo di prima non
    // vale piu': il CAP e il comune erano di quell'indirizzo, non di questo.
    // Lasciandoli attaccati, chi corregge "Via Roma" in una via di un altro
    // paese si porta dietro il comune vecchio senza vederlo, e il fattorino
    // parte con un indirizzo che nessuno ha mai scritto.
    if (dettaglio) setDettaglio("");
    if (!civicoAMano.current && civico) setCivico("");
    scelto.current = "";
  }

  function prendi(s: Suggerimento) {
    // Il numero puo' essere in tre posti: nel suggerimento, gia' nel suo campo,
    // o dentro la riga appena battuta ("via garibaldi 329 viagrande").
    // Scegliendo dall'elenco la via viene riscritta come la dice il fornitore:
    // se non lo si recuperasse da li', sparirebbe sotto gli occhi di chi
    // l'aveva appena scritto.
    const numero =
      s.civico ||
      civico.trim() ||
      civicoScritto(via, `${s.via} ${s.dettaglio}`);

    // Resta "a mano" solo se e' rimasto in piedi quello gia' battuto nel campo.
    civicoAMano.current = !!civico.trim() && numero === civico.trim();

    scelto.current = s.via;
    setVia(s.via);
    setDettaglio(s.dettaglio);
    if (numero) setCivico(numero);
    setAperto(false);
    setSuggerimenti([]);
    // Senza numero il posto e' incompleto: il cursore va dove manca.
    if (!numero) {
      requestAnimationFrame(() => campoCivico.current?.focus());
    }
  }

  function tasti(e: React.KeyboardEvent) {
    if (!aperto || !suggerimenti.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEvidenziato((i) => (i + 1) % suggerimenti.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEvidenziato((i) => (i - 1 + suggerimenti.length) % suggerimenti.length);
    } else if (e.key === "Enter" && evidenziato >= 0) {
      e.preventDefault();
      prendi(suggerimenti[evidenziato]);
    } else if (e.key === "Escape") {
      setAperto(false);
    }
  }

  // L'avviso guarda anche la via: chi scrive "Via Roma 12" tutto di seguito il
  // numero l'ha dato, e vedersi dire che manca insegna solo a non fidarsi
  // dell'avviso — che poi e' quello che serve quando manca davvero.
  const mancaCivico =
    via.trim().length > 2 && !civico.trim() && !sembraAvereCivico(via);

  return (
    <div className="space-y-1" ref={box}>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={via}
            onChange={(e) => cambiaVia(e.target.value)}
            onKeyDown={tasti}
            onFocus={() => suggerimenti.length && setAperto(true)}
            placeholder="Via di consegna"
            aria-label="Via di consegna"
            aria-autocomplete="list"
            aria-expanded={aperto}
            role="combobox"
            className="input h-10 w-full pr-7"
          />
          {cercando && (
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: "var(--muted)" }}
              aria-hidden="true"
            >
              …
            </span>
          )}

          {aperto && suggerimenti.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl p-1 shadow-xl"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              {suggerimenti.map((s, i) => (
                <li key={s.testo + i}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === evidenziato}
                    onMouseEnter={() => setEvidenziato(i)}
                    onClick={() => prendi(s)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left"
                    style={
                      i === evidenziato
                        ? { background: "var(--brand-50)" }
                        : undefined
                    }
                  >
                    <span className="text-sm font-medium">
                      {s.via}
                      {s.civico && <span className="tnum"> {s.civico}</span>}
                    </span>
                    {s.dettaglio && (
                      <span
                        className="text-xs"
                        style={{ color: "var(--muted)" }}
                      >
                        {s.dettaglio}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          ref={campoCivico}
          value={civico}
          onChange={(e) => {
            civicoAMano.current = true;
            setCivico(e.target.value);
          }}
          placeholder="Civico"
          aria-label="Numero civico"
          className="input h-10 w-20 shrink-0"
          style={
            mancaCivico ? { borderColor: "var(--warn)" } : undefined
          }
        />
      </div>

      {dettaglio && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {dettaglio}
        </div>
      )}
      {mancaCivico && (
        <div className="text-xs" style={{ color: "var(--warn)" }}>
          Manca il civico: senza, chi consegna gira a vuoto.
        </div>
      )}
    </div>
  );
}
