"use client";

import { useMemo, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";
import { CHANNELS, getChannel, type Channel } from "@/lib/channels";
import OraRitiro from "@/components/OraRitiro";
import IndirizzoAuto from "@/components/IndirizzoAuto";
import ClienteAuto from "@/components/ClienteAuto";
import type { Calendario } from "@/lib/orari";
import type { DatiCliente, IncomingItem } from "@/lib/order-create";
import type { ClienteRubrica } from "@/lib/rubrica";

// Cassa del banco. Non e' il menu del cliente rimpicciolito: qui l'operatore ha
// una tastiera davanti e le mani occupate, quindi tutto e' un tocco solo —
// niente foglio della variante, niente carrello da aprire, niente conferme.

export type ProdottoCassa = {
  id: string;
  name: string;
  priceCents: number;
  categoria: string;
  pinned: boolean;
  acceptsNote: boolean;
  variants: { id: string; name: string; priceCents: number }[];
};

type Riga = {
  productId: string;
  variantId: string | null;
  nome: string;
  priceCents: number;
  qty: number;
  // I prodotti su richiesta non hanno senso senza: la nota E' il prodotto.
  // Su tutti gli altri la nota c'e' lo stesso, ma facoltativa: "senza
  // ghiaccio" lo si dice al banco esattamente come al tavolo.
  richiedeNota: boolean;
  note: string;
  // Campo aperto a mano su una riga che non lo pretende.
  notaAperta: boolean;
};

export default function CassaBanco({
  prodotti,
  canaliAttivi,
  orari,
  stampaPredefinita,
  rubricaAttiva,
  invia,
}: {
  prodotti: ProdottoCassa[];
  canaliAttivi: Channel[];
  orari: Calendario;
  // Da cosa partono le spunte, per canale: sono le impostazioni del locale.
  stampaPredefinita: {
    comanda: Record<string, boolean>;
    scontrino: boolean;
  };
  // Modulo rubrica acceso: senza, i campi restano quelli di sempre e la
  // spunta non compare.
  rubricaAttiva: boolean;
  invia: (
    channel: Channel,
    items: IncomingItem[],
    cliente: DatiCliente,
    saldaSubito: boolean,
    stampa: { comanda: boolean; scontrino: boolean },
    salvaCliente: boolean
  ) => Promise<{
    ok: boolean;
    comande?: number;
    scontrino?: boolean;
    cliente?: boolean;
  }>;
}) {
  const [channel, setChannel] = useState<Channel>(canaliAttivi[0] ?? "banco");
  const [categoria, setCategoria] = useState<string>("Preferiti");
  const [query, setQuery] = useState("");
  const [righe, setRighe] = useState<Riga[]>([]);
  const [nome, setNome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [consegna, setConsegna] = useState("");
  const [oraRitiro, setOraRitiro] = useState("");
  // Quello che si sa del cliente scelto dalla rubrica: i pezzi
  // dell'indirizzo, che il campo si ricompone da solo, e la nota di
  // consegna, che serve sotto gli occhi di chi sta prendendo l'ordine.
  const [daRubrica, setDaRubrica] = useState<{
    via: string;
    civico: string;
    dettaglio: string;
  } | null>(null);
  const [notaCliente, setNotaCliente] = useState("");
  // Rimonta il campo indirizzo quando arriva un cliente nuovo: e' l'unico
  // modo perche' riparta pulito invece di mescolare i pezzi di due schede.
  const [rimonta, setRimonta] = useState(0);
  // La spunta parte accesa: la rubrica si riempie lavorando, che e' l'unico
  // modo perche' si riempia davvero. Si spegne per chi non vuole essere
  // schedato e per l'ordine di passaggio che non tornera' mai piu'.
  const [salvaCliente, setSalvaCliente] = useState(true);
  // Le spunte partono dalle impostazioni e si ritarano cambiando canale, ma
  // una volta toccate restano come le ha messe l'operatore: se le ha spente
  // apposta, riaccenderle da sole sarebbe un dispetto.
  const [stampaComanda, setStampaComanda] = useState<boolean | null>(null);
  const [stampaScontrino, setStampaScontrino] = useState<boolean | null>(null);
  const [inviando, setInviando] = useState(false);
  const [esito, setEsito] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const canale = getChannel(channel);
  const comandaOn = stampaComanda ?? (stampaPredefinita.comanda[channel] ?? false);
  const scontrinoOn = stampaScontrino ?? stampaPredefinita.scontrino;

  const categorie = useMemo(() => {
    const c = [...new Set(prodotti.map((p) => p.categoria))];
    return prodotti.some((p) => p.pinned) ? ["Preferiti", ...c] : c;
  }, [prodotti]);

  // Senza nessun preferito la linguetta non esiste: si ricade sulla prima
  // categoria vera, invece di restare su una griglia vuota.
  const categoriaAttiva = categorie.includes(categoria)
    ? categoria
    : (categorie[0] ?? "");

  const q = query.trim().toLowerCase();
  const visibili = useMemo(() => {
    if (q) {
      return prodotti.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (categoriaAttiva === "Preferiti") return prodotti.filter((p) => p.pinned);
    return prodotti.filter((p) => p.categoria === categoriaAttiva);
  }, [prodotti, q, categoriaAttiva]);

  function aggiungi(p: ProdottoCassa, v?: { id: string; name: string; priceCents: number }) {
    setEsito(null);
    const variantId = v?.id ?? null;
    const nomeRiga = v ? `${p.name} — ${v.name}` : p.name;
    const prezzo = v ? v.priceCents : p.priceCents;
    setRighe((prev) => {
      // Due richieste diverse non si sommano: sono due drink diversi. Nemmeno
      // una riga con la nota aperta, che e' un'altra cosa da preparare.
      const i = p.acceptsNote
        ? -1
        : prev.findIndex(
            (r) =>
              r.productId === p.id &&
              r.variantId === variantId &&
              !r.notaAperta &&
              !r.note
          );
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: next[i].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.id,
          variantId,
          nome: nomeRiga,
          priceCents: prezzo,
          qty: 1,
          richiedeNota: p.acceptsNote,
          note: "",
          notaAperta: false,
        },
      ];
    });
  }

  function cambiaNota(i: number, testo: string) {
    setRighe((prev) =>
      prev.map((r, k) => (k === i ? { ...r, note: testo } : r))
    );
  }

  // Una riga con la nota aperta non si somma piu' alle altre uguali: quella
  // "senza ghiaccio" e' un'altra cosa da preparare.
  function apriNota(i: number) {
    setRighe((prev) =>
      prev.flatMap((r, k) => {
        if (k !== i) return [r];
        if (r.qty === 1) return [{ ...r, notaAperta: true }];
        return [
          { ...r, qty: r.qty - 1 },
          { ...r, qty: 1, notaAperta: true },
        ];
      })
    );
  }

  function cambiaQty(i: number, d: number) {
    setRighe((prev) =>
      prev.flatMap((r, k) =>
        k === i ? (r.qty + d <= 0 ? [] : [{ ...r, qty: r.qty + d }]) : [r]
      )
    );
  }

  function svuota() {
    setRighe([]);
    setNome("");
    setTelefono("");
    setIndirizzo("");
    setConsegna("");
    setOraRitiro("");
    setDaRubrica(null);
    setNotaCliente("");
    setRimonta((n) => n + 1);
    // La spunta torna accesa a ogni ordine nuovo, al contrario di quelle di
    // stampa: quelle sono un'abitudine del locale, questa e' una scelta del
    // singolo cliente. Lasciarla spenta vorrebbe dire che il "no" di uno
    // spegne la rubrica per tutti quelli che vengono dopo.
    setSalvaCliente(true);
    setErrore(null);
  }

  // Cliente preso dalla rubrica: si compila tutto, che e' il motivo per cui
  // la rubrica esiste. Resta tutto correggibile — l'indirizzo di stasera
  // puo' essere quello dell'ufficio invece che quello di casa.
  function prendiCliente(c: ClienteRubrica) {
    setNome(c.nome);
    setTelefono(c.telefono);
    setNotaCliente(c.note);
    // L'indirizzo si tiene da parte anche in asporto: se l'ordine diventa una
    // consegna a meta' telefonata — succede — il campo si trova gia' pieno
    // invece di far ridettare tutto.
    setDaRubrica({ via: c.via, civico: c.civico, dettaglio: c.dettaglio });
    setRimonta((n) => n + 1);
    if (canale.chiedeIndirizzo) setIndirizzo(c.indirizzo);
  }

  const consegnaCents = (() => {
    const n = parseFloat(consegna.replace(",", ".").replace(/[^0-9.]/g, ""));
    return Number.isNaN(n) ? 0 : Math.round(n * 100);
  })();

  const totale =
    righe.reduce((s, r) => s + r.priceCents * r.qty, 0) +
    (channel === "domicilio" ? consegnaCents : 0);

  async function conferma() {
    if (!righe.length || inviando) return;
    if (canale.chiedeIndirizzo && !indirizzo.trim()) {
      setErrore("Serve l'indirizzo, o il fattorino non sa dove andare.");
      return;
    }
    const senzaNota = righe.find((r) => r.richiedeNota && !r.note.trim());
    if (senzaNota) {
      setErrore(`Scrivi cosa vuole per «${senzaNota.nome}».`);
      return;
    }
    setInviando(true);
    setErrore(null);
    try {
      const r = await invia(
        channel,
        righe.map((x) => ({
          productId: x.productId,
          variantId: x.variantId,
          alias: "Tavolo",
          quantity: x.qty,
          note: x.note.trim() || undefined,
        })),
        {
          nome: nome.trim() || undefined,
          telefono: telefono.trim() || undefined,
          indirizzo: indirizzo.trim() || undefined,
          consegnaCents: channel === "domicilio" ? consegnaCents : 0,
          oraRitiro: oraRitiro.trim() || undefined,
        },
        // Al banco si paga subito; asporto e domicilio si incassano al ritiro
        // o alla consegna, quindi restano fra i conti aperti.
        channel === "banco",
        { comanda: comandaOn, scontrino: scontrinoOn },
        rubricaAttiva && salvaCliente
      );
      if (!r.ok) {
        setErrore("Non sono riuscito a registrare l'ordine. Riprova.");
        return;
      }
      // "Non ha stampato niente" e' un esito che l'operatore non deve
      // scoprire guardando la stampante ferma: o si dice quante comande sono
      // partite, o si dice perche' non ne e' partita nessuna.
      const pezzi: string[] = [];
      if (r.comande) {
        pezzi.push(`${r.comande} ${r.comande === 1 ? "comanda" : "comande"}`);
      }
      if (r.scontrino) pezzi.push("scontrino");
      const stampa = pezzi.length
        ? ` In stampa: ${pezzi.join(" e ")}.`
        : " Niente da stampare.";

      setEsito(
        (channel === "banco"
          ? `Incassato ${fmt(totale)}. È in coda per la preparazione.`
          : `${canale.singolare} registrato. Si incassa al ritiro.`) +
          stampa +
          (r.cliente ? " Cliente in rubrica." : "")
      );
      svuota();
    } finally {
      setInviando(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0 space-y-3">
        {canaliAttivi.length > 1 && (
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ background: "var(--surface-2)" }}
          >
            {CHANNELS.filter((c) => canaliAttivi.includes(c.key)).map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  setChannel(c.key);
                  setEsito(null);
                  setErrore(null);
                }}
                className={
                  "min-h-10 flex-1 rounded-lg px-3 text-sm transition " +
                  (channel === c.key ? "font-medium shadow-sm" : "")
                }
                style={
                  channel === c.key
                    ? { background: "var(--surface)", color: "var(--text)" }
                    : { color: "var(--muted)" }
                }
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca un prodotto…"
          aria-label="Cerca un prodotto"
          className="input h-11 w-full"
        />

        {!q && (
          <div className="scroll-x flex gap-2">
            {categorie.map((c) => (
              <button
                key={c}
                onClick={() => setCategoria(c)}
                className={
                  "min-h-10 whitespace-nowrap rounded-full px-4 text-sm transition " +
                  (categoriaAttiva === c ? "font-medium" : "")
                }
                style={
                  categoriaAttiva === c
                    ? { background: "var(--brand)", color: "var(--brand-on)" }
                    : { background: "var(--surface-2)", color: "var(--muted)" }
                }
              >
                {c === "Preferiti" ? "★ Preferiti" : c}
              </button>
            ))}
          </div>
        )}

        {visibili.length === 0 ? (
          <div className="card p-8 text-center text-sm" style={{ color: "var(--muted)" }}>
            {categoriaAttiva === "Preferiti" && !q
              ? "Nessun preferito. Segnali dal tab Menu e compaiono qui."
              : "Nessun prodotto."}
          </div>
        ) : (
          // Riquadri larghi: si toccano col pollice su un tablet appoggiato al
          // bancone, non col puntatore.
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {visibili.map((p) =>
              p.variants.length ? (
                p.variants.map((v) => (
                  <button
                    key={p.id + v.id}
                    onClick={() => aggiungi(p, v)}
                    className="card flex min-h-20 flex-col justify-between p-3 text-left transition active:scale-95"
                  >
                    <span className="text-sm font-medium leading-tight">
                      {p.name}
                      <span className="block text-xs" style={{ color: "var(--muted)" }}>
                        {v.name}
                      </span>
                    </span>
                    <span className="tnum mt-1 text-sm font-semibold">
                      {fmt(v.priceCents)}
                    </span>
                  </button>
                ))
              ) : (
                <button
                  key={p.id}
                  onClick={() => aggiungi(p)}
                  className="card flex min-h-20 flex-col justify-between p-3 text-left transition active:scale-95"
                >
                  <span className="text-sm font-medium leading-tight">
                    {p.name}
                  </span>
                  <span className="tnum mt-1 text-sm font-semibold">
                    {fmt(p.priceCents)}
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Lo scontrino resta sempre a schermo: alla cassa non si apre e chiude
          un carrello, si guarda quello che si sta battendo. */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">{canale.label}</span>
            {righe.length > 0 && (
              <button
                onClick={svuota}
                className="text-xs underline"
                style={{ color: "var(--muted)" }}
              >
                svuota
              </button>
            )}
          </div>

          {righe.length === 0 ? (
            <p className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
              {esito ?? "Tocca un prodotto per iniziare."}
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {righe.map((r, i) => (
                <li key={`${r.productId}-${r.variantId ?? ""}-${i}`} className="text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex shrink-0 items-center rounded-lg"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <button
                        onClick={() => cambiaQty(i, -1)}
                        aria-label={`Togli ${r.nome}`}
                        className="flex h-8 w-8 items-center justify-center"
                      >
                        −
                      </button>
                      <span className="tnum w-5 text-center">{r.qty}</span>
                      <button
                        onClick={() => cambiaQty(i, 1)}
                        aria-label={`Aggiungi ${r.nome}`}
                        className="flex h-8 w-8 items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <span className="min-w-0 flex-1 truncate">{r.nome}</span>
                    {!r.richiedeNota && !r.notaAperta && (
                      <button
                        onClick={() => apriNota(i)}
                        className="shrink-0 text-xs underline"
                        style={{ color: "var(--brand-text)" }}
                      >
                        + nota
                      </button>
                    )}
                    <span className="tnum shrink-0 font-medium">
                      {fmt(r.priceCents * r.qty)}
                    </span>
                  </div>
                  {/* Su un prodotto su richiesta la nota e' il prodotto: senza,
                      chi lo prepara non sa cosa versare. Sugli altri e'
                      facoltativa, ma serve lo stesso — "senza ghiaccio" si
                      dice al banco come al tavolo. */}
                  {(r.richiedeNota || r.notaAperta) && (
                    <input
                      autoFocus={r.notaAperta}
                      value={r.note}
                      onChange={(e) => cambiaNota(i, e.target.value)}
                      maxLength={200}
                      placeholder={
                        r.richiedeNota ? "Cosa vuole?" : "Senza ghiaccio, ben cotta…"
                      }
                      aria-label={`Nota per ${r.nome}`}
                      className="input mt-1 h-9 w-full text-xs"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {canale.chiedeNome && (
            <div className="mt-3 space-y-2">
              <ClienteAuto
                attiva={rubricaAttiva}
                nome={nome}
                telefono={telefono}
                onNome={setNome}
                onTelefono={setTelefono}
                onScegli={prendiCliente}
              />
              {/* Il citofono rotto, il cane, il secondo piano: sta scritto
                  in rubrica proprio perche' nessuno se lo ricorda. */}
              {notaCliente && (
                <p
                  className="rounded-lg px-2.5 py-1.5 text-xs"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--muted)",
                  }}
                >
                  {notaCliente}
                </p>
              )}
              {/* Al telefono l'ora concordata e' la prima cosa che dicono:
                  senza, la cucina parte subito e il cliente ritira freddo. */}
              <OraRitiro
                value={oraRitiro}
                onChange={setOraRitiro}
                orari={orari}
                etichetta={
                  channel === "domicilio"
                    ? "Quando consegnare"
                    : "Quando ritira"
                }
              />
              {canale.chiedeIndirizzo && (
                <>
                  <IndirizzoAuto
                    key={rimonta}
                    value={indirizzo}
                    onChange={setIndirizzo}
                    iniziale={daRubrica ?? undefined}
                  />
                  <input
                    value={consegna}
                    onChange={(e) => setConsegna(e.target.value)}
                    placeholder="Costo di consegna €"
                    aria-label="Costo di consegna in euro"
                    inputMode="decimal"
                    className="input h-10 w-full"
                  />
                </>
              )}
            </div>
          )}

          {errore && (
            <p
              role="status"
              className="mt-2 text-xs"
              style={{ color: "var(--danger)" }}
            >
              {errore}
            </p>
          )}

          {/* Le spunte partono dalle impostazioni, ma l'ultima parola ce l'ha
              chi sta alla cassa: davanti ha il cliente, non un pannello. */}
          <div
            className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t pt-2.5 text-xs"
            style={{ borderColor: "var(--border)" }}
          >
            {[
              {
                on: comandaOn,
                set: setStampaComanda,
                etichetta: "Comanda",
              },
              {
                on: scontrinoOn,
                set: setStampaScontrino,
                etichetta: "Scontrino",
              },
            ].map((s) => (
              <label
                key={s.etichetta}
                className="flex cursor-pointer items-center gap-1.5"
                style={{ color: s.on ? "var(--text)" : "var(--muted)" }}
              >
                <input
                  type="checkbox"
                  checked={s.on}
                  onChange={(e) => s.set(e.target.checked)}
                />
                Stampa {s.etichetta.toLowerCase()}
              </label>
            ))}

            {/* Accesa di suo: una rubrica che si riempie solo quando
                qualcuno si ricorda di spuntare una casella resta vuota. */}
            {rubricaAttiva && canale.chiedeNome && (
              <label
                className="flex cursor-pointer items-center gap-1.5"
                style={{
                  color: salvaCliente ? "var(--text)" : "var(--muted)",
                }}
              >
                <input
                  type="checkbox"
                  checked={salvaCliente}
                  onChange={(e) => setSalvaCliente(e.target.checked)}
                />
                Salva in rubrica
              </label>
            )}
          </div>

          <div
            className="mt-2 flex items-baseline justify-between border-t pt-3"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Totale
            </span>
            <span className="tnum text-xl font-semibold">{fmt(totale)}</span>
          </div>

          <button
            onClick={conferma}
            disabled={!righe.length || inviando}
            className="btn btn-primary mt-3 h-12 w-full text-base disabled:opacity-40"
          >
            {inviando
              ? "..."
              : channel === "banco"
                ? `Incassa ${fmt(totale)}`
                : `Registra ${canale.singolare.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
