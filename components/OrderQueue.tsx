"use client";

import { useEffect, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";
import { getChannel } from "@/lib/channels";

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
  customerAddress: string | null;
  dueAt: string | null;
  status: string;
  createdAt: string;
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
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // La modifica si accende per un ordine alla volta: durante il servizio le
  // crocette sempre a schermo si toccano per sbaglio.
  const [modifica, setModifica] = useState<string | null>(null);
  const [erroreVoce, setErroreVoce] = useState<string | null>(null);

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
      setOrders(d.orders ?? []);
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

  async function setStatus(id: string, status: string) {
    setBusy(id);
    try {
      await advance(id, status);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loaded && orders.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <div className="text-base font-medium">Nessun ordine in coda</div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          I nuovi ordini compaiono qui da soli, senza ricaricare.
        </p>
      </div>
    );
  }

  // I piu' vecchi in cima: si smaltisce dalla testa della coda.
  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="space-y-3">
      {sorted.map((o) => {
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
  );
}
