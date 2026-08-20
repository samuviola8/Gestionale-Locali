"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  daQuanto,
  formatPrice,
  ORIGINE_ETICHETTA,
  type OrigineOccupazione,
} from "@/lib/format";

// La sala durante il servizio: un riquadro per tavolo, e quello che di quel
// tavolo si sa adesso — da quanto sono seduti, in quanti, quanto hanno fatto.
//
// Si tocca un tavolo per sceglierlo, se ne toccano due per accostarli. Le
// azioni stanno tutte nella barra in fondo e non su ogni riquadro: con venti
// tavoli a schermo, venti file di pulsanti sono un muro, e la cosa che si
// cerca — chi e' seduto da troppo — sparisce dentro.

export type GruppoVista = {
  capofila: number;
  tavoli: number[];
  da: string | null;
  origine: OrigineOccupazione;
  persone: number;
  totaleCents: number;
  daIncassareCents: number;
  contoKey: string | null;
  inPreparazione: boolean;
  chiamata: boolean;
  daPrenotazione: boolean;
};

export type TavoloVista = {
  numero: number;
  posti: number;
  gruppo: GruppoVista | null;
  prossimo: { alle: string; nome: string; persone: number } | null;
};

type Esito = { ok: true } | { ok: false; errore: string };

// Oltre le due ore un tavolo non e' piu' «in servizio»: o stanno per andarsene
// o si sono fermati. In tutti e due i casi e' quello da guardare per primo, ed
// e' l'unica cosa che questa pagina evidenzia da sola.
const SEDUTI_DA_TROPPO = 120;

function ora(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PiantaSala({
  tavoli,
  copertiSeduti,
  splitBill,
  qrOrdering,
  unisciTavoli,
  apriTavolo,
  spostaConto,
  separaTavoli,
  liberaTavolo,
  segnaPersone,
}: {
  tavoli: TavoloVista[];
  copertiSeduti: number;
  splitBill: boolean;
  qrOrdering: boolean;
  unisciTavoli: (numeri: number[], persone?: number | null) => Promise<Esito>;
  apriTavolo: (tavolo: number, persone?: number | null) => Promise<Esito>;
  spostaConto: (da: number, a: number[]) => Promise<Esito>;
  separaTavoli: (tavolo: number) => Promise<Esito>;
  liberaTavolo: (tavolo: number) => Promise<Esito>;
  segnaPersone: (tavolo: number, persone: number) => Promise<Esito>;
}) {
  const router = useRouter();
  const [scelti, setScelti] = useState<number[]>([]);
  // null = il campo segue la selezione, ed e' il caso normale: si tocca un
  // tavolo da quattro e c'e' gia' scritto quattro. Diventa una stringa quando
  // qualcuno ci scrive dentro, e torna a seguire la selezione al tavolo dopo —
  // altrimenti accostando un tavolo il numero resterebbe quello di prima, che
  // e' proprio quello che si sta cambiando.
  const [persone, setPersone] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, avvia] = useTransition();
  const [adesso, setAdesso] = useState(() => Date.now());

  // Due orologi diversi: i dati arrivano dal server e vanno richiesti, i
  // minuti seduti si contano da soli. Ricaricare la pagina ogni trenta secondi
  // solo per far avanzare un numero sarebbe traffico buttato.
  useEffect(() => {
    const dati = setInterval(() => router.refresh(), 20000);
    const orologio = setInterval(() => setAdesso(Date.now()), 30000);
    return () => {
      clearInterval(dati);
      clearInterval(orologio);
    };
  }, [router]);

  const occupati = tavoli.filter((t) => t.gruppo);
  const selezionati = tavoli.filter((t) => scelti.includes(t.numero));
  const unico = selezionati.length === 1 ? selezionati[0] : null;
  const gruppoUnico = unico?.gruppo ?? null;

  function tocca(numero: number) {
    setErrore(null);
    setPersone(null);
    setScelti((s) =>
      s.includes(numero) ? s.filter((n) => n !== numero) : [...s, numero]
    );
  }

  function esegui(azione: () => Promise<Esito>, chiudi = true) {
    setErrore(null);
    avvia(async () => {
      const esito = await azione();
      if (!esito.ok) {
        setErrore(esito.errore);
        return;
      }
      if (chiudi) {
        setScelti([]);
        setPersone(null);
      }
      router.refresh();
    });
  }

  // Quante persone proporre per la selezione di adesso: i posti dei tavoli
  // liberi, e per quelli gia' occupati le persone che ci sono. Un tavolo da
  // quattro propone quattro, due accostati propongono la somma — che e' la
  // risposta giusta quasi sempre, e quando non lo e' si corregge scrivendoci
  // sopra. Un gruppo si conta una volta sola anche se se ne toccano due
  // tavoli: unirne uno tira dentro tutto il gruppo comunque.
  const gruppiContati = new Set<number>();
  const suggerite = selezionati.reduce((somma, t) => {
    if (!t.gruppo) return somma + t.posti;
    if (gruppiContati.has(t.gruppo.capofila)) return somma;
    gruppiContati.add(t.gruppo.capofila);
    return somma + t.gruppo.persone;
  }, 0);

  // Un tavolo occupato piu' uno libero: gli si puo' voler dire due cose
  // diverse — accostateli, oppure quel conto e' sul tavolo sbagliato,
  // portatelo di la'. Le due possibilita' compaiono insieme, perche' il gesto
  // per arrivarci e' lo stesso e la differenza la sa solo chi sta in sala.
  const sceltiOccupati = selezionati.filter((t) => t.gruppo);
  const sceltiLiberi = selezionati.filter((t) => !t.gruppo);
  // Si sposta un gruppo solo per volta — due tavolate diverse sullo stesso
  // tavolo non sono uno spostamento — ma l'arrivo puo' essere piu' d'un
  // tavolo: la tavolata da dodici che rientra dal dehors non entra in uno.
  const gruppiScelti = new Set(sceltiOccupati.map((t) => t.gruppo!.capofila));
  const spostabile =
    gruppiScelti.size === 1 && sceltiLiberi.length > 0
      ? {
          da: sceltiOccupati[0].numero,
          a: sceltiLiberi.map((t) => t.numero),
        }
      : null;

  const valorePersone = persone ?? (suggerite ? String(suggerite) : "");
  const numeroPersone = valorePersone.trim()
    ? parseInt(valorePersone, 10)
    : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tavoli.map((t) => {
          const g = t.gruppo;
          const scelto = scelti.includes(t.numero);
          const minuti = g?.da
            ? Math.floor((adesso - new Date(g.da).getTime()) / 60000)
            : 0;
          const troppo = minuti >= SEDUTI_DA_TROPPO;
          const compagni = (g?.tavoli ?? []).filter((n) => n !== t.numero);
          const unito = compagni.length > 0;
          // Il tavolo che tiene il conto del gruppo, o un tavolo per conto suo.
          const capo = !g || t.numero === g.capofila;

          return (
            <button
              key={t.numero}
              type="button"
              onClick={() => tocca(t.numero)}
              aria-pressed={scelto}
              // Il riquadro e' fatto di righe separate: senza un nome scritto,
              // chi lo sente leggere si trova un pulsante muto.
              aria-label={
                g
                  ? `Tavolo ${t.numero}, occupato${
                      g.da
                        ? ` da ${daQuanto(new Date(g.da).getTime(), adesso)}`
                        : ""
                    }${unito ? `, unito al ${compagni.join("+")}` : ""}`
                  : `Tavolo ${t.numero}, libero`
              }
              className="card p-3 text-left transition"
              style={{
                borderColor: scelto ? "var(--brand)" : "var(--border)",
                boxShadow: scelto ? "0 0 0 2px var(--brand)" : undefined,
                background: g ? "var(--surface)" : "var(--surface-2)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold">Tavolo {t.numero}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {t.posti} posti
                </span>
              </div>

              {g ? (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    {/* Verde e giallo di sistema, non il colore del locale: un
                        locale col marchio arancione avrebbe il pallino
                        "tutto bene" identico a quello "sono qui da troppo", e
                        l'unica cosa che questa pagina segnala da sola
                        sparirebbe. */}
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        background: troppo ? "var(--warn)" : "var(--ok)",
                      }}
                    />
                    <span
                      className="text-sm font-medium tnum"
                      style={{ color: troppo ? "var(--warn)" : "var(--text)" }}
                    >
                      {g.da ? daQuanto(new Date(g.da).getTime(), adesso) : "—"}
                    </span>
                    {/* Persone e importo stanno solo sul capofila: sono del
                        gruppo, non del singolo tavolo, e ripeterli su tutti
                        e due farebbe contare due volte la stessa tavolata. */}
                    {capo && (
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        · {g.persone} {g.persone === 1 ? "persona" : "persone"}
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 text-sm tnum">
                    {!capo ? (
                      <span style={{ color: "var(--muted)" }}>
                        Conto sul tavolo {g.capofila}
                      </span>
                    ) : g.totaleCents > 0 ? (
                      <>
                        {formatPrice(g.totaleCents)}
                        {g.daIncassareCents !== g.totaleCents && (
                          <span
                            className="ml-1 text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            ({formatPrice(g.daIncassareCents)} da incassare)
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>
                        Niente ordinato
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1">
                    {g.chiamata && (
                      <span className="badge badge-danger">Ti chiamano</span>
                    )}
                    {g.inPreparazione && (
                      <span className="badge badge-warn">In preparazione</span>
                    )}
                    {unito && (
                      <span className="badge badge-brand">
                        unito al {compagni.join("+")}
                      </span>
                    )}
                    {/* Da dove viene la certezza che qui c'e' gente. Con un
                        conto aperto e' ovvio e non si scrive; negli altri due
                        casi no, ed e' quello che serve sapere. */}
                    {g.origine !== "ordine" && (
                      <span className="badge badge-muted">
                        {ORIGINE_ETICHETTA[g.origine]}
                      </span>
                    )}
                    {g.daPrenotazione && (
                      <span className="badge badge-muted">prenotato</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                  Libero
                </div>
              )}

              {t.prossimo && (
                <div
                  className="mt-2 border-t pt-2 text-xs"
                  style={{ borderColor: "var(--border)", color: "var(--muted)" }}
                >
                  {ora(t.prossimo.alle)} · {t.prossimo.nome} (
                  {t.prossimo.persone})
                </div>
              )}
            </button>
          );
        })}
      </div>

      {scelti.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-4">
          <div className="card p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-medium">
                  {selezionati.length === 1
                    ? `Tavolo ${selezionati[0].numero}`
                    : `Tavoli ${selezionati.map((t) => t.numero).join("+")}`}
                </span>
                {gruppoUnico?.da && (
                  <span className="ml-2" style={{ color: "var(--muted)" }}>
                    seduti da{" "}
                    {daQuanto(new Date(gruppoUnico.da).getTime(), adesso)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={valorePersone}
                    onChange={(e) => setPersone(e.target.value)}
                    aria-label="Quante persone"
                    className="input tnum"
                    style={{ width: 68, minHeight: 38 }}
                  />
                  persone
                </label>

                {scelti.length >= 2 && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={inCorso}
                    onClick={() =>
                      esegui(() => unisciTavoli(scelti, numeroPersone))
                    }
                  >
                    Unisci i tavoli
                  </button>
                )}

                {spostabile && (
                  <button
                    className="btn btn-sm"
                    disabled={inCorso}
                    onClick={() =>
                      esegui(() => spostaConto(spostabile.da, spostabile.a))
                    }
                  >
                    Sposta il conto sul {spostabile.a.join("+")}
                  </button>
                )}

                {unico && !gruppoUnico && (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={inCorso}
                    onClick={() =>
                      esegui(() => apriTavolo(unico.numero, numeroPersone))
                    }
                  >
                    Segna occupato
                  </button>
                )}

                {/* Solo se il numero e' stato cambiato: sul tavolo dove
                    combacia gia' non c'e' niente da salvare. */}
                {unico &&
                  gruppoUnico &&
                  numeroPersone !== null &&
                  numeroPersone !== gruppoUnico.persone && (
                    <button
                      className="btn btn-sm"
                      disabled={inCorso}
                      onClick={() =>
                        esegui(
                          () => segnaPersone(unico.numero, numeroPersone),
                          false
                        )
                      }
                    >
                      Salva persone
                    </button>
                  )}

                {unico && gruppoUnico && gruppoUnico.tavoli.length > 1 && (
                  <button
                    className="btn btn-sm"
                    disabled={inCorso}
                    onClick={() => esegui(() => separaTavoli(unico.numero))}
                  >
                    Separa
                  </button>
                )}

                {unico && gruppoUnico && (
                  <button
                    className="btn btn-sm"
                    disabled={inCorso}
                    onClick={() => esegui(() => liberaTavolo(unico.numero))}
                  >
                    Libera
                  </button>
                )}

                {unico && gruppoUnico?.contoKey && splitBill && (
                  <Link href="/dashboard/bill" className="btn btn-sm">
                    Vai al conto
                  </Link>
                )}

                {unico && qrOrdering && (
                  <Link
                    href={`/dashboard/cameriere/${gruppoUnico?.capofila ?? unico.numero}`}
                    className="btn btn-sm"
                  >
                    Ordina
                  </Link>
                )}

                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setScelti([]);
                    setPersone(null);
                    setErrore(null);
                  }}
                >
                  Annulla
                </button>
              </div>
            </div>

            {errore && (
              <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
                {errore}
              </p>
            )}

            {scelti.length >= 2 && (
              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                Uniti fanno un tavolo solo: risultano occupati tutti, e quello
                che si ordina dai loro QR finisce su un conto unico.
                {spostabile && (
                  <>
                    {" "}
                    Spostandoli, invece, i tavoli di prima tornano liberi e
                    tutto quello che avevano — conto, incassi già presi,
                    chiamate — passa al {spostabile.a.join("+")}.
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {occupati.length > 0 && (
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
          {copertiSeduti > 0
            ? `${copertiSeduti} persone sedute su ${occupati.length} ${
                occupati.length === 1 ? "tavolo" : "tavoli"
              }.`
            : `${occupati.length} ${
                occupati.length === 1 ? "tavolo occupato" : "tavoli occupati"
              }.`}{" "}
          Il tempo parte dal primo segnale che si ha di quel tavolo: il QR
          scansionato, la prima ordinazione, o il momento in cui la sala lo ha
          aperto. Le persone sono quelle che hanno detto di essere; finché
          nessuno lo dice valgono i posti dei tavoli, e si correggono da qui.
        </p>
      )}
    </>
  );
}
