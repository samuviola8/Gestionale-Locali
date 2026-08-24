"use client";

import { useEffect, useRef, useState } from "react";
import { formatKm, formatPrice as fmt } from "@/lib/format";
import { CHANNELS, getChannel, type Channel } from "@/lib/channels";
import { sbloccaAudio, suona } from "@/lib/suoni";

// Com'e' andata la mail al cliente. Interessa solo quando non e' partita: chi
// aspetta una conferma che non arriva si presenta lo stesso, all'ora che si
// era segnato. Il tipo e' scritto qui e non importato dalle azioni: quelle
// vivono sul server, e nel browser non ci devono entrare.
type EsitoMail = "inviata" | "non-richiesta" | "fallita";

type Item = {
  id: string;
  name: string;
  quantity: number;
  alias: string | null;
  note: string | null;
  glasses: number | null;
  priceCents: number;
  priceAdjusted: boolean;
  voided: boolean;
};
type Order = {
  id: string;
  tableNumber: number | null;
  channel: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
  // Solo per il domicilio: quanto paga di consegna e da quanto lontano viene.
  deliveryFeeCents: number;
  deliveryKm: number | null;
  // Arrivato dal sito: e' l'unico che si accetta o si rifiuta.
  dalWeb: boolean;
  items: Item[];
};

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Un ordine per domani deve dirlo: "per le 20:30" da solo lo fa preparare
// stasera.
function quandoRitira(d: Date): string {
  const oggi = new Date();
  const stesso =
    d.getFullYear() === oggi.getFullYear() &&
    d.getMonth() === oggi.getMonth() &&
    d.getDate() === oggi.getDate();
  const ora = d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (stesso) return `le ${ora}`;
  return `${d.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "numeric",
  })} alle ${ora}`;
}

// Da quanto aspetta questo tavolo. E' il dato che serve davvero durante il
// servizio: l'orario in cui e' arrivato l'ordine non dice quanto si e' in
// ritardo, i minuti trascorsi si'.
function waitedMinutes(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

// Le soglie dipendono dal canale: un domicilio a venti minuti e' normale, un
// tavolo a venti minuti e' un disastro. Con una soglia sola il colore mentirebbe
// su uno dei due.
function urgency(min: number, channel: string): "ok" | "warn" | "danger" {
  const c = getChannel(channel);
  if (min >= c.attesaDanger) return "danger";
  if (min >= c.attesaWarn) return "warn";
  return "ok";
}

function waitLabel(min: number): string {
  if (min < 1) return "adesso";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

// Prezzo di una richiesta: si vede quello di partenza e lo si corregge solo
// se serve, senza aprire altre schermate.
function PrezzoRichiesta({
  item,
  onSave,
}: {
  item: Item;
  onSave: (priceCents: number) => Promise<string | null>;
}) {
  const [aperto, setAperto] = useState(false);
  const [euro, setEuro] = useState(
    (item.priceCents / 100).toFixed(2).replace(".", ",")
  );
  const [salvo, setSalvo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    const n = parseFloat(euro.replace(",", ".").replace(/[^0-9.]/g, ""));
    if (Number.isNaN(n) || n < 0) {
      setErrore("Scrivi una cifra, per esempio 14,50.");
      return;
    }
    setSalvo(true);
    setErrore(null);
    try {
      // Dietro al banco nessuno apre la console: se il prezzo non passa
      // bisogna dirlo qui, o il barman chiude convinto di averlo cambiato.
      const problema = await onSave(Math.round(n * 100));
      if (problema) setErrore(problema);
      else setAperto(false);
    } catch {
      setErrore("Non sono riuscito a salvare. Riprova.");
    } finally {
      setSalvo(false);
    }
  }

  if (!aperto) {
    return (
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        <span className="tnum font-semibold">{fmt(item.priceCents)}</span>
        {item.priceAdjusted && (
          <span style={{ color: "var(--muted)" }}>prezzo corretto</span>
        )}
        <button
          onClick={() => setAperto(true)}
          className="underline"
          style={{ color: "var(--brand-text)" }}
        >
          cambia prezzo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={euro}
          onChange={(e) => {
            setEuro(e.target.value);
            setErrore(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") salva();
            if (e.key === "Escape") setAperto(false);
          }}
          inputMode="decimal"
          aria-label={`Prezzo di ${item.name}, in euro`}
          className="h-9 w-20 rounded-lg px-2 text-sm"
          style={{
            border: `1px solid ${errore ? "var(--danger)" : "var(--border)"}`,
            background: "var(--surface)",
            color: "var(--text)",
          }}
        />
        <button onClick={salva} disabled={salvo} className="btn btn-sm">
          {salvo ? "..." : "Salva"}
        </button>
        <button onClick={() => setAperto(false)} className="btn btn-sm">
          Annulla
        </button>
      </div>
      {errore && (
        <div
          role="status"
          className="mt-1 text-xs"
          style={{ color: "var(--danger)" }}
        >
          {errore}
        </div>
      )}
    </div>
  );
}

export default function OrderQueue({
  advance,
  setItemPrice,
  voidItem,
  accetta,
  rifiuta,
  sospendi,
  canali,
  vendeDalWeb,
  suono,
  sospesoFinoIniziale,
}: {
  advance: (id: string, status: string) => Promise<void>;
  setItemPrice: (
    itemId: string,
    priceCents: number
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  voidItem: (
    itemId: string,
    annulla: boolean
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  accetta: (
    id: string,
    correzioni?: { consegnaCents?: number; spostaMinuti?: number }
  ) => Promise<
    { ok: true; comande: number; mail: EsitoMail } | { ok: false; error: string }
  >;
  rifiuta: (id: string) => Promise<{ ok: boolean; mail: EsitoMail }>;
  sospendi: (sospendi: boolean) => Promise<{ fino: string | null }>;
  // I canali che questo locale ha davvero: le pillole del filtro sono queste.
  canali: Channel[];
  // Se il sito sta vendendo: e' un'altra cosa dall'avere il modulo asporto —
  // si puo' fare asporto solo al telefono — ed e' l'unico caso in cui ha senso
  // mostrare il rubinetto della sospensione.
  vendeDalWeb: boolean;
  // Come il locale si fa avvisare quando arriva un ordine dal sito: e' lo
  // stesso suono delle chiamate dal tavolo, perche' e' la stessa cosa —
  // qualcuno che aspetta una risposta.
  suono: string;
  sospesoFinoIniziale: string | null;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // La modifica si accende per un ordine alla volta: durante il servizio le
  // crocette sempre a schermo si toccano per sbaglio.
  const [modifica, setModifica] = useState<string | null>(null);
  const [erroreVoce, setErroreVoce] = useState<string | null>(null);
  // Il filtro per canale. Durante il servizio si guarda una cosa per volta:
  // chi impacchetta gli asporti non vuole scorrere i tavoli.
  const [filtro, setFiltro] = useState<Channel | "tutti">("tutti");
  const [sospesoFino, setSospesoFino] = useState<string | null>(
    sospesoFinoIniziale
  );
  const [messaggio, setMessaggio] = useState<string | null>(null);

  // Gli ordini dal web gia' visti da questo schermo. Il suono e' per quelli
  // nuovi: ripeterlo a ogni lettura, ogni tre secondi, finche' qualcuno non
  // accetta, sarebbe un allarme antifurto.
  const visti = useRef<Set<string> | null>(null);
  const suonoRef = useRef(suono);
  suonoRef.current = suono;

  async function annulla(itemId: string, annullare: boolean) {
    setErroreVoce(null);
    const esito = await voidItem(itemId, annullare);
    if (!esito.ok) setErroreVoce(esito.error);
    await load();
  }
  // I minuti di attesa devono salire anche quando non arrivano ordini nuovi.
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    try {
      const r = await fetch("/api/orders", { cache: "no-store" });
      const d = await r.json();
      const arrivati: Order[] = d.orders ?? [];
      setOrders(arrivati);

      // Alla prima lettura si prende nota e basta: quelli gia' in coda non
      // sono "arrivati adesso", e chi ricarica la pagina non deve sentirseli
      // suonare tutti.
      const inAttesa = arrivati.filter((o) => o.status === "pending");
      if (visti.current === null) {
        visti.current = new Set(inAttesa.map((o) => o.id));
      } else {
        const nuovi = inAttesa.filter((o) => !visti.current!.has(o.id));
        visti.current = new Set(inAttesa.map((o) => o.id));
        if (nuovi.length) suona(suonoRef.current);
      }
    } catch {
      // rete momentaneamente assente: si riprova al prossimo giro
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, 3000);
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  // I browser non suonano niente finche' qualcuno non ha toccato la pagina. Al
  // primo tocco si apre la strada, una volta sola: cosi' l'ordine che arriva
  // mezz'ora dopo si sente.
  useEffect(() => {
    const apri = () => sbloccaAudio();
    window.addEventListener("pointerdown", apri, { once: true });
    window.addEventListener("keydown", apri, { once: true });
    return () => {
      window.removeEventListener("pointerdown", apri);
      window.removeEventListener("keydown", apri);
    };
  }, []);

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await advance(id, status);
      await load();
    } finally {
      setBusy(null);
    }
  }

  // Quando serve, non quando e' arrivato. Un asporto per le 21 ordinato alle 18
  // resterebbe in cima alla coda tutto il pomeriggio, e la coda si legge dalla
  // cima: chi un orario concordato non ce l'ha — i tavoli, il banco — vale per
  // quando e' arrivato, che per loro e' la stessa cosa.
  const quando = (o: Order) => new Date(o.dueAt ?? o.createdAt).getTime();
  const perOrario = (a: Order, b: Order) => quando(a) - quando(b);

  const visibili = orders.filter(
    (o) => filtro === "tutti" || o.channel === filtro
  );
  const daAccettare = visibili
    .filter((o) => o.status === "pending")
    .sort(perOrario);
  const inCoda = visibili.filter((o) => o.status !== "pending").sort(perOrario);

  // Le pillole hanno senso da due canali in su: in un locale che fa solo sala
  // non filtrerebbero niente.
  const pillole =
    canali.length > 1
      ? CHANNELS.filter((c) => canali.includes(c.key))
      : [];

  async function cambiaSospensione() {
    const esito = await sospendi(!sospesoFino);
    setSospesoFino(esito.fino);
    setMessaggio(
      esito.fino
        ? "Ordini dal sito sospesi. Si riaprono da soli a mezzanotte."
        : "Ordini dal sito riaperti."
    );
  }

  return (
    <div className="space-y-4">
      {vendeDalWeb && (
        <div
          className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={
            sospesoFino
              ? { borderColor: "var(--warn)", background: "var(--warn-bg)" }
              : undefined
          }
        >
          <span className="text-sm">
            {sospesoFino ? (
              <>
                <span className="font-medium">
                  Ordini dal sito sospesi.
                </span>{" "}
                <span style={{ color: "var(--muted)" }}>
                  Si riaprono da soli a mezzanotte.
                </span>
              </>
            ) : (
              <span style={{ color: "var(--muted)" }}>
                Il sito sta prendendo ordini.
              </span>
            )}
          </span>
          <button
            onClick={cambiaSospensione}
            className={sospesoFino ? "btn btn-primary btn-sm" : "btn btn-sm"}
          >
            {sospesoFino ? "Riprendi adesso" : "Sospendi per stasera"}
          </button>
        </div>
      )}

      {pillole.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltro("tutti")}
            aria-pressed={filtro === "tutti"}
            className={
              "rounded-full border px-3 py-1.5 text-xs " +
              (filtro === "tutti" ? "bd-brand" : "bd")
            }
            style={
              filtro === "tutti"
                ? { background: "var(--brand)", color: "var(--brand-on)" }
                : { color: "var(--muted)" }
            }
          >
            Tutti
            <span className="tnum ml-1.5 opacity-70">{orders.length}</span>
          </button>
          {pillole.map((c) => {
            const quanti = orders.filter((o) => o.channel === c.key).length;
            const attivo = filtro === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setFiltro(c.key)}
                aria-pressed={attivo}
                className={
                  "rounded-full border px-3 py-1.5 text-xs " +
                  (attivo ? "bd-brand" : "bd")
                }
                style={
                  attivo
                    ? { background: "var(--brand)", color: "var(--brand-on)" }
                    : { color: "var(--muted)" }
                }
              >
                {c.label}
                <span className="tnum ml-1.5 opacity-70">{quanti}</span>
              </button>
            );
          })}
        </div>
      )}

      {messaggio && (
        <p role="status" className="text-sm" style={{ color: "var(--ok)" }}>
          {messaggio}
        </p>
      )}

      {daAccettare.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider">
            Da accettare
            <span className="tnum ml-2" style={{ color: "var(--muted)" }}>
              {daAccettare.length}
            </span>
          </h2>
          {daAccettare.map((o) => (
            <DaAccettare
              key={o.id}
              o={o}
              accetta={accetta}
              rifiuta={rifiuta}
              aggiorna={load}
              avvisa={setMessaggio}
            />
          ))}
        </section>
      )}

      {loaded && inCoda.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <div className="text-base font-medium">
            {daAccettare.length
              ? "Niente in preparazione"
              : filtro === "tutti"
                ? "Nessun ordine in coda"
                : `Nessun ordine ${getChannel(filtro).label.toLowerCase()}`}
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            I nuovi ordini compaiono qui da soli, senza ricaricare.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {inCoda.map((o) => {
            // Con un orario concordato l'attesa non conta: conta quanto manca.
            // Un asporto per le 20:30 ordinato alle 18 non e' in ritardo di due ore.
            const perLe = o.dueAt ? new Date(o.dueAt) : null;
            const mancano = perLe
              ? Math.round((perLe.getTime() - now) / 60000)
              : null;
            const min = waitedMinutes(o.createdAt, now);
            const level =
              mancano !== null
                ? mancano <= 0
                  ? "danger"
                  : mancano <= 10
                    ? "warn"
                    : "ok"
                : urgency(min, o.channel);
            const canale = getChannel(o.channel);
            const inSala = o.channel === "tavolo";
            const isNew = o.status === "new";
            // I pezzi annullati non si preparano: non vanno contati.
            const pieces = o.items
              .filter((i) => !i.voided)
              .reduce((s, i) => s + i.quantity, 0);
            const inModifica = modifica === o.id;

            return (
              <article
                key={o.id}
                className="card overflow-hidden"
                style={
                  // Filetto laterale colorato: si coglie la priorita' con la coda
                  // dell'occhio, senza leggere.
                  level === "ok"
                    ? undefined
                    : {
                        borderLeftWidth: 3,
                        borderLeftColor:
                          level === "danger" ? "var(--danger)" : "var(--warn)",
                      }
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-lg font-semibold">
                      {inSala
                        ? `Tavolo ${o.tableNumber}`
                        : o.customerName
                          ? `${canale.singolare} · ${o.customerName}`
                          : canale.singolare}
                    </span>
                    {!inSala && (
                      <span className="badge badge-brand">{canale.label}</span>
                    )}
                    {/* Un ordine dal sito l'ha scritto il cliente da solo: chi
                        lo prepara deve saperlo, perche' non c'e' nessuno in
                        sala a cui chiedere cosa intendeva. */}
                    {o.dalWeb && (
                      <span className="badge badge-muted">dal sito</span>
                    )}
                    <span
                      className={"badge " + (isNew ? "badge-brand" : "badge-muted")}
                    >
                      {isNew ? "Nuovo" : "In preparazione"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={"badge badge-" + level}>
                      {mancano !== null ? (
                        <span className="tnum">
                          {mancano > 0
                            ? `fra ${waitLabel(mancano)}`
                            : `in ritardo di ${waitLabel(-mancano)}`}
                        </span>
                      ) : (
                        <>
                          <span className="tnum">{waitLabel(min)}</span>
                          {level === "danger" && " di attesa"}
                        </>
                      )}
                    </span>
                    {perLe && (
                      <span className="tnum text-xs font-medium">
                        per {quandoRitira(perLe)}
                      </span>
                    )}
                    <span className="tnum text-xs" style={{ color: "var(--muted)" }}>
                      {time(o.createdAt)}
                    </span>
                    <button
                      onClick={() => {
                        setErroreVoce(null);
                        setModifica(inModifica ? null : o.id);
                      }}
                      className="text-xs underline"
                      style={{
                        color: inModifica ? "var(--text)" : "var(--muted)",
                      }}
                    >
                      {inModifica ? "fine" : "modifica"}
                    </button>
                  </div>
                </div>

                {/* L'indirizzo sta accanto alla comanda: chi impacchetta e chi
                    consegna guardano la stessa card. */}
                {o.customerAddress && (
                  <p className="mt-1.5 px-4 text-sm" style={{ color: "var(--muted)" }}>
                    {o.customerAddress}
                  </p>
                )}

                {inModifica && (
                  <p className="mt-2 px-4 text-xs" style={{ color: "var(--muted)" }}>
                    Se un prodotto è finito, annullalo: esce dal conto e il cliente
                    lo vede barrato sul telefono.
                  </p>
                )}
                {inModifica && erroreVoce && (
                  <p
                    role="status"
                    className="mt-1 px-4 text-xs"
                    style={{ color: "var(--danger)" }}
                  >
                    {erroreVoce}
                  </p>
                )}

                <ul className="mt-2.5 space-y-1 px-4 text-sm">
                  {o.items.map((it, i) => (
                    <li key={it.id ?? i}>
                      {/* La barratura sta sul solo nome: messa sulla riga intera
                          si trascinerebbe anche sul pulsante e sulle etichette,
                          perche' il tratto passa ai figli e loro non lo tolgono. */}
                      <div className="flex items-center gap-2">
                        <span
                          className="tnum font-semibold"
                          style={it.voided ? { color: "var(--muted)" } : undefined}
                        >
                          {it.quantity}×
                        </span>
                        <span
                          className="flex-1"
                          style={
                            it.voided
                              ? {
                                  textDecoration: "line-through",
                                  color: "var(--muted)",
                                }
                              : undefined
                          }
                        >
                          {it.name}
                        </span>
                        {it.voided && <span className="badge badge-muted">annullato</span>}
                        {/* Portare la bottiglia senza i calici vuol dire tornare
                            indietro: il numero sta accanto al nome, non in coda. */}
                        {!!it.glasses && (
                          <span className="badge badge-brand">
                            {it.glasses} {it.glasses === 1 ? "calice" : "calici"}
                          </span>
                        )}
                        {/* Il nome della persona ha senso solo dove il conto si
                            divide: al banco "Tavolo" e' il valore interno, non
                            un'informazione. */}
                        {inSala && it.alias && (
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            {it.alias}
                          </span>
                        )}
                        {inModifica && (
                          <button
                            onClick={() => annulla(it.id, !it.voided)}
                            className="shrink-0 text-xs underline"
                            style={{
                              color: it.voided ? "var(--brand-text)" : "var(--danger)",
                            }}
                          >
                            {it.voided ? "ripristina" : "annulla"}
                          </button>
                        )}
                      </div>

                      {/* Richiesta scritta dal cliente: e' la riga che il barman
                          deve leggere davvero, quindi non si confonde col resto. */}
                      {it.note && (
                        <div
                          className="mt-1 rounded-lg px-3 py-2"
                          style={{
                            background: "var(--warn-bg)",
                            borderLeft: "2px solid var(--warn)",
                          }}
                        >
                          <div className="text-[13px] italic">«{it.note}»</div>
                          <PrezzoRichiesta
                            item={it}
                            onSave={async (cents) => {
                              const esito = await setItemPrice(it.id, cents);
                              if (!esito.ok) return esito.error;
                              await load();
                              return null;
                            }}
                          />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                <div
                  className="mt-3 flex items-center justify-between gap-3 px-4 py-3"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {pieces} {pieces === 1 ? "pezzo" : "pezzi"}
                  </span>
                  {isNew ? (
                    <button
                      onClick={() => setStatus(o.id, "preparing")}
                      disabled={busy === o.id}
                      className="btn btn-primary btn-sm"
                    >
                      {busy === o.id ? "..." : "Inizia a preparare"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setStatus(o.id, "served")}
                      disabled={busy === o.id}
                      className="btn btn-sm"
                    >
                      {busy === o.id ? "..." : "Segna come servito"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

// L'ordine arrivato dal sito, prima che qualcuno l'abbia guardato.
//
// Non e' una card della coda: qui non si prepara niente, si decide. E le due
// cose che si decidono stanno sotto gli occhi — l'ora concordata, che si puo'
// spostare quando la cucina non ce la fa, e il costo della consegna, che si
// corregge dove la distanza in linea d'aria ha mentito.
function DaAccettare({
  o,
  accetta,
  rifiuta,
  aggiorna,
  avvisa,
}: {
  o: Order;
  accetta: (
    id: string,
    correzioni?: { consegnaCents?: number; spostaMinuti?: number }
  ) => Promise<
    { ok: true; comande: number; mail: EsitoMail } | { ok: false; error: string }
  >;
  rifiuta: (id: string) => Promise<{ ok: boolean; mail: EsitoMail }>;
  aggiorna: () => Promise<void>;
  avvisa: (m: string | null) => void;
}) {
  const [sposta, setSposta] = useState(0);
  const [euro, setEuro] = useState(
    (o.deliveryFeeCents / 100).toFixed(2).replace(".", ",")
  );
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // Il rifiuto in due tocchi: e' l'unico gesto di questa pagina che il cliente
  // non puo' vedere annullato.
  const [sicuro, setSicuro] = useState(false);

  const canale = getChannel(o.channel);
  const domicilio = o.channel === "domicilio";
  const perLe = o.dueAt ? new Date(o.dueAt) : null;
  const spostata = perLe ? new Date(perLe.getTime() + sposta * 60000) : null;

  const consegnaCents = Math.round(
    (parseFloat(euro.replace(",", ".").replace(/[^0-9.]/g, "")) || 0) * 100
  );
  const totale =
    o.items
      .filter((i) => !i.voided)
      .reduce((s, i) => s + i.priceCents * i.quantity, 0) +
    (domicilio ? consegnaCents : 0);

  async function conferma() {
    setBusy(true);
    setErrore(null);
    try {
      const esito = await accetta(o.id, {
        ...(domicilio ? { consegnaCents } : {}),
        ...(sposta ? { spostaMinuti: sposta } : {}),
      });
      if (!esito.ok) {
        setErrore(esito.error);
        return;
      }
      avvisa(
        [
          esito.comande
            ? `Accettato. ${esito.comande} ${
                esito.comande === 1 ? "comanda" : "comande"
              } in stampa.`
            : "Accettato: è in coda.",
          // Una conferma che non parte e' peggio del silenzio: il cliente si
          // presenta lo stesso, all'ora che si era segnato.
          esito.mail === "fallita"
            ? "La mail al cliente non è partita: chiamalo."
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
      await aggiorna();
    } finally {
      setBusy(false);
    }
  }

  async function scarta() {
    setBusy(true);
    try {
      const esito = await rifiuta(o.id);
      avvisa(
        esito.mail === "fallita"
          ? "Ordine rifiutato, ma la mail al cliente non è partita: chiamalo."
          : "Ordine rifiutato. Il cliente lo vede sulla sua pagina."
      );
      await aggiorna();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      className="card overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: "var(--brand)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-lg font-semibold">
            {o.customerName
              ? `${canale.singolare} · ${o.customerName}`
              : canale.singolare}
          </span>
          <span className="badge badge-brand">{canale.label}</span>
          <span className="badge badge-warn">dal sito</span>
        </div>
        {o.customerPhone && (
          <a
            href={`tel:${o.customerPhone}`}
            className="tnum text-sm underline"
            style={{ color: "var(--muted)" }}
          >
            {o.customerPhone}
          </a>
        )}
      </div>

      {o.customerAddress && (
        <p className="mt-1.5 px-4 text-sm">
          {o.customerAddress}
          {o.deliveryKm !== null && (
            <span className="tnum ml-2" style={{ color: "var(--muted)" }}>
              {formatKm(o.deliveryKm)}
            </span>
          )}
        </p>
      )}
      {domicilio && o.deliveryKm === null && (
        <p className="mt-1 px-4 text-xs" style={{ color: "var(--warn-text)" }}>
          Questo indirizzo non l&apos;abbiamo trovato sulla mappa: il costo
          della consegna decidilo tu qui sotto.
        </p>
      )}

      <ul className="mt-2.5 space-y-1 px-4 text-sm">
        {o.items.map((it, i) => (
          <li key={it.id ?? i} className="flex items-start gap-2">
            <span className="tnum font-semibold">{it.quantity}×</span>
            <span className="flex-1">
              {it.name}
              {it.note && (
                <span
                  className="block text-[13px] italic"
                  style={{ color: "var(--muted)" }}
                >
                  «{it.note}»
                </span>
              )}
            </span>
            <span className="tnum" style={{ color: "var(--muted)" }}>
              {fmt(it.priceCents * it.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div
        className="mt-3 space-y-3 px-4 pb-3 pt-3"
        style={{ background: "var(--surface-2)" }}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span style={{ color: "var(--muted)" }}>
            {domicilio ? "Consegna per" : "Ritiro"}
          </span>
          <span className="tnum font-semibold">
            {spostata ? quandoRitira(spostata) : "senza orario"}
          </span>
          {perLe && (
            <>
              <button
                onClick={() => setSposta(sposta + 15)}
                className="btn btn-sm"
                disabled={busy}
              >
                +15 min
              </button>
              <button
                onClick={() => setSposta(sposta + 30)}
                className="btn btn-sm"
                disabled={busy}
              >
                +30 min
              </button>
              {sposta !== 0 && (
                <button
                  onClick={() => setSposta(0)}
                  className="text-xs underline"
                  style={{ color: "var(--muted)" }}
                >
                  rimetti {quandoRitira(perLe)}
                </button>
              )}
            </>
          )}
        </div>

        {domicilio && (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span style={{ color: "var(--muted)" }}>Costo di consegna</span>
            <input
              value={euro}
              onChange={(e) => setEuro(e.target.value)}
              inputMode="decimal"
              aria-label="Costo di consegna in euro"
              className="input tnum h-9 w-24 text-sm"
            />
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="tnum text-sm font-semibold">
            Totale {fmt(totale)}
          </span>
          <div className="flex items-center gap-2">
            {sicuro ? (
              <>
                <button
                  onClick={scarta}
                  disabled={busy}
                  className="btn btn-sm"
                  style={{ color: "var(--danger)" }}
                >
                  {busy ? "..." : "Confermi il rifiuto?"}
                </button>
                <button
                  onClick={() => setSicuro(false)}
                  className="text-xs underline"
                  style={{ color: "var(--muted)" }}
                >
                  no
                </button>
              </>
            ) : (
              <button
                onClick={() => setSicuro(true)}
                disabled={busy}
                className="btn btn-sm"
              >
                Rifiuta
              </button>
            )}
            <button
              onClick={conferma}
              disabled={busy}
              className="btn btn-primary btn-sm"
            >
              {busy ? "..." : "Accetta"}
            </button>
          </div>
        </div>

        {errore && (
          <p
            role="status"
            className="text-xs"
            style={{ color: "var(--danger)" }}
          >
            {errore}
          </p>
        )}
      </div>
    </article>
  );
}
