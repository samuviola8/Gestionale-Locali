"use client";

import { useMemo, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";
import type { MenuCategory, MenuProduct } from "@/lib/menu";

// «Mi aggiungete due birre»: il cliente richiama a ordine gia' partito.
//
// Sta dentro «modifica» di un conto aperto e non e' un secondo ordine: la roba
// finisce su questo conto, che al ritiro si incassa una volta sola. Al tavolo
// invece nasce un ordine nuovo sullo stesso tavolo, perche' li' il conto ne
// raccoglie tanti e la comanda deve entrare in coda con l'ora di adesso.
//
// Si cerca invece di sfogliare: al telefono si sa gia' il nome del piatto, e
// scorrere sei categorie con qualcuno in linea e' tempo di nessuno.

type Riga = {
  productId: string;
  variantId?: string | null;
  alias: string;
  quantity: number;
  note?: string;
};

type Scelta = {
  chiave: string;
  productId: string;
  variantId: string | null;
  nome: string;
  prezzoCents: number;
  quantita: number;
  nota: string;
};

export default function AggiungiAlConto({
  menu,
  inSala,
  candidati,
  aggiungi,
  fatto,
}: {
  menu: MenuCategory[];
  /** In sala la voce si puo' intestare a chi l'ha presa. */
  inSala: boolean;
  /** Le persone del conto che un nome ce l'hanno. */
  candidati: string[];
  aggiungi: (
    righe: Riga[]
  ) => Promise<{ ok: true; comande: number } | { ok: false; error: string }>;
  fatto: () => Promise<void> | void;
}) {
  const [aperto, setAperto] = useState(false);
  const [cerca, setCerca] = useState("");
  const [scelte, setScelte] = useState<Scelta[]>([]);
  const [alias, setAlias] = useState("Tavolo");
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const prodotti = useMemo(
    () => menu.flatMap((c) => c.products.filter((p) => p.available)),
    [menu]
  );

  const trovati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return [];
    return prodotti
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.ingredients.some((i) => i.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [cerca, prodotti]);

  function scegli(p: MenuProduct, variantId: string | null) {
    const v = p.variants.find((x) => x.id === variantId) ?? null;
    const chiave = `${p.id}:${variantId ?? ""}`;
    setErrore(null);
    setScelte((prev) => {
      const gia = prev.find((s) => s.chiave === chiave);
      if (gia) {
        return prev.map((s) =>
          s.chiave === chiave
            ? { ...s, quantita: Math.min(s.quantita + 1, 99) }
            : s
        );
      }
      return [
        ...prev,
        {
          chiave,
          productId: p.id,
          variantId,
          nome: v ? `${p.name} — ${v.name}` : p.name,
          prezzoCents: v ? v.priceCents : p.priceCents,
          quantita: 1,
          nota: "",
        },
      ];
    });
    setCerca("");
  }

  function cambia(chiave: string, di: number) {
    setScelte((prev) =>
      prev
        .map((s) =>
          s.chiave === chiave
            ? { ...s, quantita: Math.min(Math.max(s.quantita + di, 0), 99) }
            : s
        )
        .filter((s) => s.quantita > 0)
    );
  }

  async function invia() {
    if (!scelte.length) return;
    setBusy(true);
    setErrore(null);
    try {
      const esito = await aggiungi(
        scelte.map((s) => ({
          productId: s.productId,
          variantId: s.variantId,
          alias: inSala ? alias : "Tavolo",
          quantity: s.quantita,
          note: s.nota.trim() || undefined,
        }))
      );
      if (!esito.ok) {
        setErrore(esito.error);
        return;
      }
      setScelte([]);
      setAperto(false);
      // Quante comande sono partite: «non stampa niente» e' l'unica cosa che
      // chi ha aggiunto non deve scoprire quando il cliente arriva.
      setMessaggio(
        esito.comande
          ? `Aggiunto. ${esito.comande} ${
              esito.comande === 1 ? "comanda" : "comande"
            } in stampa.`
          : "Aggiunto al conto."
      );
      await fatto();
    } catch {
      setErrore("Non sono riuscito ad aggiungere. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  const totale = scelte.reduce((s, r) => s + r.prezzoCents * r.quantita, 0);

  if (!aperto) {
    return (
      <div className="mt-2">
        <button
          onClick={() => {
            setAperto(true);
            setMessaggio(null);
          }}
          className="btn btn-sm"
        >
          + Aggiungi al conto
        </button>
        {messaggio && (
          <span className="ml-2 text-xs" style={{ color: "var(--ok)" }}>
            {messaggio}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="mt-2 rounded-xl border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <input
        value={cerca}
        onChange={(e) => setCerca(e.target.value)}
        placeholder="Cerca un piatto o un ingrediente…"
        aria-label="Cerca nel menu"
        autoFocus
        className="input"
      />

      {trovati.length > 0 && (
        <ul className="mt-2 space-y-1">
          {trovati.map((p) => (
            <li key={p.id}>
              {p.variants.length ? (
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="font-medium">{p.name}</span>
                  {p.variants
                    .filter((v) => v.available)
                    .map((v) => (
                      <button
                        key={v.id}
                        onClick={() => scegli(p, v.id)}
                        className="btn btn-sm"
                      >
                        {v.name} · {fmt(v.priceCents)}
                      </button>
                    ))}
                </div>
              ) : (
                <button
                  onClick={() => scegli(p, null)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                  style={{ background: "var(--surface)" }}
                >
                  <span>{p.name}</span>
                  <span className="tnum" style={{ color: "var(--muted)" }}>
                    {fmt(p.priceCents)}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {cerca.trim() && trovati.length === 0 && (
        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
          Niente con questo nome fra i prodotti disponibili.
        </p>
      )}

      {scelte.length > 0 && (
        <div className="mt-3 space-y-2">
          {scelte.map((s) => (
            <div key={s.chiave} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="flex-1">{s.nome}</span>
                <button
                  onClick={() => cambia(s.chiave, -1)}
                  aria-label={`Togli uno ${s.nome}`}
                  className="btn btn-sm"
                >
                  −
                </button>
                <span className="tnum w-6 text-center font-semibold">
                  {s.quantita}
                </span>
                <button
                  onClick={() => cambia(s.chiave, 1)}
                  aria-label={`Aggiungi un altro ${s.nome}`}
                  className="btn btn-sm"
                >
                  +
                </button>
                <span className="tnum w-16 text-right">
                  {fmt(s.prezzoCents * s.quantita)}
                </span>
              </div>
              <input
                value={s.nota}
                onChange={(e) =>
                  setScelte((prev) =>
                    prev.map((x) =>
                      x.chiave === s.chiave ? { ...x, nota: e.target.value } : x
                    )
                  )
                }
                maxLength={200}
                placeholder="Nota — senza cipolla, ben cotta…"
                aria-label={`Nota per ${s.nome}`}
                className="input mt-1 text-sm"
              />
            </div>
          ))}

          {/* In sala la voce va su chi se l'e' presa, o resta condivisa. Fuori
              dalla sala non c'e' niente da dividere: e' un conto solo. */}
          {inSala && candidati.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span style={{ color: "var(--muted)" }}>Per</span>
              <select
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="input h-9 text-sm"
              >
                <option value="Tavolo">Tavolo (condiviso)</option>
                {candidati.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={invia}
          disabled={busy || !scelte.length}
          className="btn btn-primary btn-sm"
        >
          {busy ? "..." : scelte.length ? `Aggiungi · ${fmt(totale)}` : "Aggiungi"}
        </button>
        <button
          onClick={() => {
            setAperto(false);
            setScelte([]);
            setCerca("");
            setErrore(null);
          }}
          className="text-xs underline"
          style={{ color: "var(--muted)" }}
        >
          annulla
        </button>
      </div>

      {errore && (
        <p role="status" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
          {errore}
        </p>
      )}
    </div>
  );
}
