"use client";

import { useMemo, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";
import { CHANNELS, getChannel, type Channel } from "@/lib/channels";
import OraRitiro from "@/components/OraRitiro";
import IndirizzoAuto from "@/components/IndirizzoAuto";
import type { OrariApertura } from "@/lib/orari";
import type { DatiCliente, IncomingItem } from "@/lib/order-create";

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
  richiedeNota: boolean;
  note: string;
};

export default function CassaBanco({
  prodotti,
  canaliAttivi,
  orari,
  stampaPredefinita,
  invia,
}: {
  prodotti: ProdottoCassa[];
  canaliAttivi: Channel[];
  orari: OrariApertura;
  // Da cosa partono le spunte, per canale: sono le impostazioni del locale.
  stampaPredefinita: {
    comanda: Record<string, boolean>;
    scontrino: boolean;
  };
  invia: (
    channel: Channel,
    items: IncomingItem[],
    cliente: DatiCliente,
    saldaSubito: boolean,
    stampa: { comanda: boolean; scontrino: boolean }
  ) => Promise<{ ok: boolean; comande?: number; scontrino?: boolean }>;
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
      // Due richieste diverse non si sommano: sono due drink diversi.
      const i = p.acceptsNote
        ? -1
        : prev.findIndex(
            (r) => r.productId === p.id && r.variantId === variantId
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
        },
      ];
    });
  }

  function cambiaNota(i: number, testo: string) {
    setRighe((prev) =>
      prev.map((r, k) => (k === i ? { ...r, note: testo } : r))
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
    setErrore(null);
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
        { comanda: comandaOn, scontrino: scontrinoOn }
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
          : `${canale.singolare} registrato. Si incassa al ritiro.`) + stampa
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
                    <span className="tnum shrink-0 font-medium">
                      {fmt(r.priceCents * r.qty)}
                    </span>
                  </div>
                  {/* Su un prodotto su richiesta la nota e' il prodotto: senza,
                      chi lo prepara non sa cosa versare. */}
                  {r.richiedeNota && (
                    <input
                      value={r.note}
                      onChange={(e) => cambiaNota(i, e.target.value)}
                      maxLength={200}
                      placeholder="Cosa vuole?"
                      aria-label={`Cosa vuole per ${r.nome}`}
                      className="input mt-1 h-9 w-full text-xs"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}

          {canale.chiedeNome && (
            <div className="mt-3 space-y-2">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome di chi ritira"
                aria-label="Nome di chi ritira"
                className="input h-10 w-full"
              />
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Telefono"
                aria-label="Telefono"
                inputMode="tel"
                className="input h-10 w-full"
              />
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
                  <IndirizzoAuto value={indirizzo} onChange={setIndirizzo} />
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
                  className="h-3.5 w-3.5 accent-[var(--brand)]"
                />
                Stampa {s.etichetta.toLowerCase()}
              </label>
            ))}
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
