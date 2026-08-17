"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  cercaFasce,
  inviaPrenotazione,
  type MotivoVuoto,
} from "@/app/prenota/actions";

// Il modulo di prenotazione, in quattro passi che si aprono uno dopo l'altro.
//
// L'ordine non e' casuale: prima le due cose che il cliente ha gia' in testa
// (quante persone, quando), poi quello che il locale puo' davvero offrire, e
// solo alla fine nome e telefono. Chiedere i recapiti prima di aver mostrato
// un orario libero e' chiedere l'impegno prima di aver dato la risposta.

export type GiornoScelta = {
  iso: string;
  /** "Oggi", "Domani", oppure il giorno della settimana abbreviato. */
  nome: string;
  numero: string;
  mese: string;
};

function Passo({
  indice,
  titolo,
  fatto,
  children,
}: {
  indice: number;
  titolo: string;
  fatto: boolean;
  children: React.ReactNode;
}) {
  const id = `pr-passo-${indice}`;
  return (
    <section className="pr-passo" role="group" aria-labelledby={id}>
      <h2 id={id} className="pr-titolo-passo">
        <span className="pr-indice" data-fatto={fatto ? "si" : "no"}>
          {fatto ? "✓" : indice}
        </span>
        {titolo}
      </h2>
      {children}
    </section>
  );
}

export default function ModuloPrenotazione({
  giorni,
  minPersone,
  maxPersone,
  confermaAutomatica,
  nota,
  telefono,
  ultimoGiorno,
  giorniAvanti,
  emailObbligatoria,
}: {
  giorni: GiornoScelta[];
  minPersone: number;
  maxPersone: number;
  confermaAutomatica: boolean;
  nota: string | null;
  telefono: string | null;
  /** Ultima data prenotabile: oltre, il locale non prende impegni. */
  ultimoGiorno: string;
  giorniAvanti: number;
  /** Il locale manda la conferma via mail: senza indirizzo non arriverebbe. */
  emailObbligatoria: boolean;
}) {
  const router = useRouter();

  const personeAmmesse = useMemo(
    () =>
      Array.from(
        { length: maxPersone - minPersone + 1 },
        (_, i) => minPersone + i
      ),
    [minPersone, maxPersone]
  );

  const [persone, setPersone] = useState(() =>
    Math.min(Math.max(2, minPersone), maxPersone)
  );
  const [giorno, setGiorno] = useState(giorni[0]?.iso ?? "");
  const [ora, setOra] = useState("");
  // `null` = le fasce non sono ancora arrivate. Vuoto = arrivate e non ce n'e'.
  const [fasce, setFasce] = useState<string[] | null>(null);
  const [motivo, setMotivo] = useState<MotivoVuoto | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);
  const dati = useRef<HTMLDivElement>(null);

  // Le fasce si chiedono al server a ogni cambio: fra il caricamento della
  // pagina e la scelta passano minuti, e in quei minuti un tavolo si prende.
  useEffect(() => {
    if (!giorno) return;
    let vivo = true;
    setFasce(null);
    setOra("");
    setErrore(null);

    cercaFasce(giorno, persone).then((r) => {
      if (!vivo) return;
      setFasce(r.ok ? r.fasce : []);
      setMotivo(r.ok ? (r.motivo ?? null) : null);
      if (!r.ok) setErrore(r.errore);
    });

    return () => {
      vivo = false;
    };
  }, [giorno, persone]);

  const giornoScelto = giorni.find((g) => g.iso === giorno);
  const etichettaGiorno = giornoScelto
    ? `${giornoScelto.nome} ${giornoScelto.numero} ${giornoScelto.mese}`
    : giorno
      ? new Date(`${giorno}T12:00`).toLocaleDateString("it-IT", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : "";

  async function invia(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invio) return;
    const modulo = new FormData(e.currentTarget);
    setInvio(true);
    setErrore(null);

    try {
      const r = await inviaPrenotazione({
        giorno,
        ora,
        persone,
        nome: String(modulo.get("nome") ?? ""),
        telefono: String(modulo.get("telefono") ?? ""),
        email: String(modulo.get("email") ?? ""),
        note: String(modulo.get("note") ?? ""),
        sito: String(modulo.get("sito") ?? ""),
      });

      if (r.ok) {
        router.push(`/prenota/${r.token}`);
        return;
      }

      setErrore(r.errore);
      setInvio(false);
      // Se l'orario e' saltato mentre si compilava, l'elenco va rifatto: senza,
      // si riproverebbe a prendere lo stesso posto che non c'e' piu'.
      const aggiornate = await cercaFasce(giorno, persone);
      setFasce(aggiornate.ok ? aggiornate.fasce : []);
      if (aggiornate.ok && !aggiornate.fasce.includes(ora)) setOra("");
    } catch {
      setErrore("Connessione assente. Riprova fra un momento.");
      setInvio(false);
    }
  }

  if (!giorni.length) {
    return (
      <div className="pr-avviso mt-8">
        In questo momento non ci sono giorni prenotabili online.
        {telefono ? (
          <>
            {" "}
            Per un tavolo puoi chiamare il locale allo{" "}
            <a href={`tel:${telefono}`} className="underline">
              {telefono}
            </a>
            .
          </>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={invia} className="mt-6">
      <Passo indice={1} titolo="Quante persone" fatto>
        <div className="pr-scelte">
          {personeAmmesse.map((n) => (
            <button
              key={n}
              type="button"
              className="pr-chip"
              aria-pressed={n === persone}
              onClick={() => setPersone(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-xs" style={{ color: "var(--muted)" }}>
          {maxPersone < 20 ? (
            <>
              Online si prenota fino a {maxPersone}{" "}
              {maxPersone === 1 ? "persona" : "persone"}. Per un gruppo più
              numeroso{" "}
              {telefono ? (
                <a href={`tel:${telefono}`} className="underline">
                  chiama il locale
                </a>
              ) : (
                "conviene chiamare il locale"
              )}
              .
            </>
          ) : (
            "Bambini e seggioloni: scrivilo nelle note, in fondo."
          )}
        </p>
      </Passo>

      <Passo indice={2} titolo="Che giorno" fatto={!!giorno}>
        <div className="pr-scelte pr-fila">
          {giorni.map((g) => (
            <button
              key={g.iso}
              type="button"
              className="pr-chip pr-chip-giorno"
              aria-pressed={g.iso === giorno}
              aria-label={`${g.nome} ${g.numero} ${g.mese}`}
              onClick={() => setGiorno(g.iso)}
            >
              <span>
                {g.numero} {g.mese}
              </span>
              <small>{g.nome}</small>
            </button>
          ))}
        </div>

        <label className="mt-3 flex flex-wrap items-center gap-2.5 text-xs" style={{ color: "var(--muted)" }}>
          Oppure un&apos;altra data
          <input
            type="date"
            className="input"
            style={{ width: "auto", minHeight: 40 }}
            value={giorno}
            min={giorni[0]?.iso}
            max={ultimoGiorno}
            onChange={(e) => e.target.value && setGiorno(e.target.value)}
          />
        </label>
      </Passo>

      <Passo indice={3} titolo="A che ora" fatto={!!ora}>
        {fasce === null ? (
          <div className="pr-ore" aria-live="polite" aria-busy="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="pr-scheletro skeleton" />
            ))}
            <span className="sr-only">Cerco i tavoli liberi…</span>
          </div>
        ) : fasce.length ? (
          <div className="pr-ore" role="group" aria-label="Orari disponibili">
            {fasce.map((f) => (
              <button
                key={f}
                type="button"
                className="pr-chip tnum"
                aria-pressed={f === ora}
                onClick={() => {
                  setOra(f);
                  // Il modulo dei dati compare adesso: portarcelo sotto gli
                  // occhi evita di lasciarlo fuori schermo su un telefono.
                  requestAnimationFrame(() =>
                    dati.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "nearest",
                    })
                  );
                }}
              >
                {f}
              </button>
            ))}
          </div>
        ) : (
          <div className="pr-avviso mt-3.5">
            {motivo === "oltre" ? (
              <>
                Online si prenota fino a {giorniAvanti} giorni in anticipo. Per
                una data più lontana serve una telefonata.
              </>
            ) : motivo === "chiuso" ? (
              <>
                Il {etichettaGiorno.toLowerCase()} non ci sono orari
                prenotabili: o il locale è chiuso, o per oggi si è fatto tardi.
              </>
            ) : (
              <>
                Per {persone} {persone === 1 ? "persona" : "persone"} il{" "}
                {etichettaGiorno.toLowerCase()} è tutto occupato.
              </>
            )}
            {telefono ? (
              <>
                {" "}
                Prova un altro giorno oppure chiama il locale allo{" "}
                <a href={`tel:${telefono}`} className="underline">
                  {telefono}
                </a>
                .
              </>
            ) : (
              <> Prova un altro giorno.</>
            )}
          </div>
        )}
      </Passo>

      <div ref={dati}>
        {ora && (
          <div className="pr-appare">
            <Passo indice={4} titolo="I tuoi dati" fatto={false}>
              <div className="pr-riepilogo mt-3.5">
                <span>
                  {persone} {persone === 1 ? "persona" : "persone"}
                </span>
                <span aria-hidden="true">·</span>
                <span className="cap-prima">{etichettaGiorno}</span>
                <span aria-hidden="true">·</span>
                <span className="tnum">{ora}</span>
              </div>

              <div className="mt-4 grid gap-3.5">
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="pr-campo">
                    <span className="pr-etichetta">Nome e cognome</span>
                    <input
                      name="nome"
                      className="input"
                      required
                      maxLength={80}
                      autoComplete="name"
                    />
                  </label>
                  <label className="pr-campo">
                    <span className="pr-etichetta">Telefono</span>
                    <input
                      name="telefono"
                      type="tel"
                      className="input"
                      required
                      maxLength={32}
                      autoComplete="tel"
                    />
                  </label>
                </div>

                <label className="pr-campo">
                  <span className="pr-etichetta">
                    {emailObbligatoria ? "Email" : "Email (facoltativa)"}
                  </span>
                  <input
                    name="email"
                    type="email"
                    className="input"
                    required={emailObbligatoria}
                    maxLength={160}
                    autoComplete="email"
                  />
                  {emailObbligatoria && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      Ci arriva la conferma con il link per disdire.
                    </span>
                  )}
                </label>

                <label className="pr-campo">
                  <span className="pr-etichetta">
                    Qualcosa che dobbiamo sapere (facoltativo)
                  </span>
                  <textarea
                    name="note"
                    className="pr-area"
                    maxLength={300}
                    placeholder="Allergie, seggiolone, compleanno, tavolo all'aperto…"
                  />
                </label>

                <input
                  name="sito"
                  className="pr-esca"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                />
              </div>

              {errore && (
                <p
                  role="alert"
                  className="mt-4 text-sm"
                  style={{ color: "var(--danger)" }}
                >
                  {errore}
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary mt-5 w-full"
                disabled={invio}
                style={invio ? { opacity: 0.6 } : undefined}
              >
                {invio
                  ? "Invio…"
                  : confermaAutomatica
                    ? "Prenota il tavolo"
                    : "Invia la richiesta"}
              </button>

              <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                {confermaAutomatica
                  ? emailObbligatoria
                    ? "Il tavolo è tuo appena premi: la conferma ti arriva per mail, con il link per disdire se cambia qualcosa."
                    : "Il tavolo è tuo appena premi: ti arriva il riepilogo, con il link per disdire se cambia qualcosa."
                  : emailObbligatoria
                    ? "La richiesta arriva al locale, che ti risponde per mail: confermata, spostata a un altro orario o, se proprio non c'è posto, rifiutata."
                    : "La richiesta arriva al locale, che ti conferma il tavolo. Fino ad allora resta in attesa."}
                {nota ? ` ${nota}` : ""}
              </p>
            </Passo>
          </div>
        )}
      </div>

      {!ora && errore && (
        <p role="alert" className="mt-4 text-sm" style={{ color: "var(--danger)" }}>
          {errore}
        </p>
      )}
    </form>
  );
}
