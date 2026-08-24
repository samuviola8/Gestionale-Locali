"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { formatPrice as fmt } from "@/lib/format";
import FiltroCanali from "@/components/FiltroCanali";
import type { Channel } from "@/lib/channels";
import type { MenuCategory } from "@/lib/menu";
import AggiungiAlConto from "@/components/AggiungiAlConto";
import {
  ALIAS_CONDIVISO,
  membriDi,
  type BillLine,
  type BillTable,
} from "@/lib/bill";

// Una voce che si sta riportando su chi la paga davvero.
type Spostamento = {
  itemId: string;
  // Quante copie se ne spostano: il resto della riga rimane dov'e'.
  quantita: number;
  // Chi la paga da adesso. Piu' di uno vuol dire divisa tra loro.
  nomi: string[];
  // Il campo per un nome che al tavolo non c'e' ancora. Null quando e' chiuso:
  // vuoto vorrebbe dire aperto e non ancora scritto, che e' un'altra cosa.
  nuovo: string | null;
  errore: string | null;
};

export default function BillBoard({
  markAliasPaid,
  closeTable,
  setPartySize,
  voidItem,
  spostaVoce,
  stampaConto,
  canali,
  cambiaNota,
  aggiungi,
  menu,
}: {
  markAliasPaid: (key: string, alias: string) => Promise<void>;
  closeTable: (key: string) => Promise<void>;
  setPartySize: (key: string, partySize: number) => Promise<void>;
  stampaConto: (key: string) => Promise<void>;
  voidItem: (
    itemId: string,
    annulla: boolean
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  spostaVoce: (
    itemId: string,
    nomi: string[],
    quantita: number
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  // I canali che questo locale ha davvero: sono le pillole del filtro.
  canali: Channel[];
  cambiaNota: (
    itemId: string,
    nota: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  aggiungi: (
    key: string,
    righe: {
      productId: string;
      variantId?: string | null;
      alias: string;
      quantity: number;
      note?: string;
    }[]
  ) => Promise<
    { ok: true; comande: number } | { ok: false; error: string }
  >;
  // Il listino, per aggiungere una consumazione a un conto gia' aperto.
  menu: MenuCategory[];
}) {
  const [tables, setTables] = useState<BillTable[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confermaChiusura, setConfermaChiusura] = useState<BillTable | null>(
    null
  );
  const [busy, setBusy] = useState<string | null>(null);
  // Un conto alla volta in modifica: le crocette sempre accese si toccano
  // per sbaglio proprio mentre si incassa.
  const [modifica, setModifica] = useState<string | null>(null);

  // Il filtro per provenienza, come in coda ordini.
  const [filtro, setFiltro] = useState<Channel | "tutti">("tutti");
  // La riga di cui si sta scrivendo la nota, e cosa c'e' scritto finora.
  const [nota, setNota] = useState<{ itemId: string; testo: string } | null>(
    null
  );
  const [erroreVoce, setErroreVoce] = useState<string | null>(null);
  // Una voce alla volta in spostamento: il pannello e' alto, e due aperti
  // insieme farebbero perdere di vista la riga che si sta guardando.
  const [sposta, setSposta] = useState<Spostamento | null>(null);

  // Si parte da chi la paga adesso: per aggiungere un terzo a una divisione
  // gia' fatta si tocca lui e basta. Un nome che al tavolo non c'e' piu' non
  // si riporta acceso: sarebbe una scelta che nessuno ha fatto e non si vede.

  // La nota di una riga, corretta dopo. Non ristampa: la comanda con la nota
  // vecchia e' gia' in cucina, e una seconda uguale farebbe rifare il piatto.
  // La nota nuova si vede in coda, dove chi prepara guarda.
  function apriNota(i: BillLine) {
    setErroreVoce(null);
    setNota({ itemId: i.id!, testo: i.note ?? "" });
  }

  async function salvaNota() {
    if (!nota) return;
    setBusy(nota.itemId);
    const esito = await cambiaNota(nota.itemId, nota.testo);
    setBusy(null);
    if (!esito.ok) {
      setErroreVoce(esito.error);
      return;
    }
    setNota(null);
    await load();
  }
  function apriSposta(i: BillLine, alias: string, candidati: string[]) {
    setErroreVoce(null);
    setSposta({
      itemId: i.id!,
      quantita: i.quantity,
      nomi:
        alias === ALIAS_CONDIVISO
          ? [ALIAS_CONDIVISO]
          : membriDi(alias).filter((n) => candidati.includes(n)),
      nuovo: null,
      errore: null,
    });
  }

  async function confermaSposta(nomi: string[], quantita: number) {
    if (!sposta || !nomi.length) return;
    setBusy(`sposta:${sposta.itemId}`);
    try {
      const esito = await spostaVoce(sposta.itemId, nomi, quantita);
      // L'errore resta attaccato al pannello: in cima alla card, con tutto il
      // conto di mezzo, chi ha appena toccato il bottone non lo vedrebbe.
      if (!esito.ok) {
        setSposta((s) => s && { ...s, errore: esito.error });
        return;
      }
      setSposta(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function annulla(itemId: string, annullare: boolean) {
    setErroreVoce(null);
    const esito = await voidItem(itemId, annullare);
    if (!esito.ok) setErroreVoce(esito.error);
    await load();
  }

  async function load() {
    try {
      const r = await fetch("/api/bills", { cache: "no-store" });
      const d = await r.json();
      setTables(d.tables ?? []);
    } catch {
      // si riprova al prossimo giro
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function incassa(key: string, alias: string) {
    setBusy(`${key}:${alias}`);
    try {
      await markAliasPaid(key, alias);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function cambiaPersone(key: string, n: number) {
    await setPartySize(key, n);
    await load();
  }

  async function confirmClose(key: string) {
    setConfermaChiusura(null);
    await closeTable(key);
    load();
  }

  function onCloseClick(t: BillTable) {
    if (t.hasPending) setConfermaChiusura(t);
    else confirmClose(t.key);
  }

  const visibili = tables.filter(
    (t) => filtro === "tutti" || t.channel === filtro
  );

  if (loaded && tables.length === 0) {
    return (
      <div className="card px-6 py-14 text-center">
        <div className="text-base font-medium">Nessun conto aperto</div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          I tavoli compaiono qui appena inviano il primo ordine.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Le stesse pillole della coda ordini: sui conti aperti servono allo
          stesso modo — chi incassa gli asporti non deve scorrere i tavoli. */}
      <FiltroCanali
        canali={canali}
        elementi={tables}
        filtro={filtro}
        scegli={setFiltro}
      />

      {visibili.length === 0 && (
        <div className="card px-6 py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
          Nessun conto aperto su questo canale.
        </div>
      )}

      {visibili.map((t) => {
        const saldato = t.incassato >= t.total;
        const quota = t.total > 0 ? Math.round((t.incassato / t.total) * 100) : 0;
        const residuo = Math.max(0, t.total - t.incassato);

        const inSala = t.channel === "tavolo";
        // Su chi si puo' spostare una voce: le persone del conto che un nome
        // ce l'hanno. Un posto anonimo non e' una destinazione — nessuno sa
        // chi sia — e per lui c'e' il campo dove scriverlo.
        const candidati = t.people
          .filter((p) => !p.anonimo && p.alias !== "Tavolo")
          .map((p) => p.alias);

        return (
          <section key={t.key} className="card overflow-hidden">
            <div className="px-4 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold">{t.label}</h2>
                  {!inSala && (
                    <span className="badge badge-brand">
                      {t.channel === "banco"
                        ? "Banco"
                        : t.channel === "asporto"
                          ? "Asporto"
                          : "Domicilio"}
                    </span>
                  )}
                  {t.hasPending && (
                    <span className="badge badge-warn">Ordine in corso</span>
                  )}
                  <button
                    onClick={() => {
                      setErroreVoce(null);
                      setModifica(modifica === t.key ? null : t.key);
                    }}
                    className="text-xs underline"
                    style={{
                      color:
                        modifica === t.key ? "var(--text)" : "var(--muted)",
                    }}
                  >
                    {modifica === t.key ? "fine" : "modifica"}
                  </button>
                </div>
                <div className="text-right">
                  <div className="tnum text-lg font-semibold">
                    {saldato ? fmt(t.total) : fmt(residuo)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {saldato ? "tutto incassato" : "ancora da incassare"}
                  </div>
                </div>
              </div>

              {/* Il numero di persone decide quote e coperti: si corregge qui,
                  perche' il cliente puo' averlo sbagliato. Fuori dalla sala
                  non c'e' nessuno seduto, quindi non c'e' niente da correggere:
                  al suo posto servono i contatti di chi ritira. */}
              {inSala ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span style={{ color: "var(--muted)" }}>Persone al tavolo</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        cambiaPersone(t.key, Math.max(1, t.partySize - 1))
                      }
                      aria-label={`Una persona in meno al tavolo ${t.tableNumber}`}
                      className="btn btn-sm"
                    >
                      −
                    </button>
                    <span className="tnum w-8 text-center font-semibold">
                      {t.partySize}
                    </span>
                    <button
                      onClick={() => cambiaPersone(t.key, t.partySize + 1)}
                      aria-label={`Una persona in piu' al tavolo ${t.tableNumber}`}
                      className="btn btn-sm"
                    >
                      +
                    </button>
                  </div>
                  {t.coverChargeCents > 0 && (
                    <span className="badge badge-muted">
                      coperto {fmt(t.coverChargeCents)} a persona
                    </span>
                  )}
                </div>
              ) : (
                (t.customerAddress || t.customerPhone) && (
                  <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                    {t.customerAddress}
                    {t.customerAddress && t.customerPhone && " · "}
                    {t.customerPhone && (
                      <a href={`tel:${t.customerPhone}`} className="underline">
                        {t.customerPhone}
                      </a>
                    )}
                  </div>
                )
              )}

              <div
                className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "var(--surface-2)" }}
                role="progressbar"
                aria-valuenow={quota}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Incassato ${quota}% del tavolo ${t.tableNumber}`}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${quota}%`,
                    background: saldato ? "var(--ok)" : "var(--brand)",
                  }}
                />
              </div>
              <div className="mt-1.5 tnum text-xs" style={{ color: "var(--muted)" }}>
                {fmt(t.incassato)} di {fmt(t.total)}
              </div>
              {modifica === t.key && (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Annulla quello che non è stato servito: esce dal totale e
                  resta barrato, così si sa sempre perché il conto è questo.
                  Sposta quello che è finito sul conto sbagliato: su una
                  persona, o diviso tra chi se l&apos;è preso davvero. E se
                  richiamano per aggiungere, aggiungi qui: finisce su questo
                  conto, non su uno nuovo.
                </p>
              )}
              {modifica === t.key && (
                <AggiungiAlConto
                  menu={menu}
                  inSala={inSala}
                  candidati={candidati}
                  aggiungi={(righe) => aggiungi(t.key, righe)}
                  fatto={load}
                />
              )}
              {modifica === t.key && erroreVoce && (
                <p
                  role="status"
                  className="mt-1 text-xs"
                  style={{ color: "var(--danger)" }}
                >
                  {erroreVoce}
                </p>
              )}
            </div>

            <div className="mt-4 space-y-2 px-4">
              {t.people.map((p) => (
                <div
                  key={p.alias}
                  className="rounded-xl border p-3"
                  style={{
                    borderColor: "var(--border)",
                    background: p.paid ? "var(--ok-bg)" : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Fuori dalla sala l'intestatario e' uno solo, e si
                            chiama "Tavolo" solo dentro al database. */}
                        <span className="truncate font-medium">
                          {inSala
                            ? p.alias
                            : (t.customerName ?? "Da incassare")}
                        </span>
                        {p.placeholder && (
                          <span className="badge badge-muted">
                            solo condiviso
                          </span>
                        )}
                      </div>
                      <div className="tnum text-sm" style={{ color: "var(--muted)" }}>
                        {fmt(p.total)}
                      </div>
                    </div>
                    {p.paid ? (
                      <span className="badge badge-ok">Pagato</span>
                    ) : (
                      <button
                        onClick={() => incassa(t.key, p.alias)}
                        disabled={busy === `${t.key}:${p.alias}`}
                        className="btn btn-primary btn-sm"
                      >
                        {busy === `${t.key}:${p.alias}`
                          ? "..."
                          : `Incassa ${fmt(p.total)}`}
                      </button>
                    )}
                  </div>

                  <ul className="mt-2 space-y-0.5 text-sm">
                    {p.items.map((i, idx) => (
                      <li key={i.id ?? idx}>
                        <div className="flex justify-between gap-3">
                          <span
                            className="min-w-0"
                            style={
                              i.paid || i.voided
                                ? {
                                    color: "var(--muted)",
                                    textDecoration: "line-through",
                                  }
                                : undefined
                            }
                          >
                            <span className="tnum">{i.quantity}×</span> {i.name}
                            {i.note && (
                              <span className="block text-xs italic">
                                «{i.note}»
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {i.voided && (
                              <span className="badge badge-muted">
                                annullato
                              </span>
                            )}
                            <AzioniVoce
                              item={i}
                              attive={modifica === t.key}
                              spostabile={inSala}
                              onAnnulla={() => annulla(i.id!, !i.voided)}
                              onSposta={() => apriSposta(i, p.alias, candidati)}
                              onNota={() => apriNota(i)}
                            />
                            <span
                              className="tnum"
                              style={
                                i.paid || i.voided
                                  ? {
                                      color: "var(--muted)",
                                      textDecoration: "line-through",
                                    }
                                  : undefined
                              }
                            >
                              {fmt(i.priceCents * i.quantity)}
                            </span>
                          </span>
                        </div>
                        {nota && nota.itemId === i.id && (
                          <PannelloNota
                            testo={nota.testo}
                            scrivi={(v) =>
                              setNota((p) => (p ? { ...p, testo: v } : p))
                            }
                            salva={salvaNota}
                            chiudi={() => setNota(null)}
                            inCorso={busy === i.id}
                          />
                        )}
                        {sposta && sposta.itemId === i.id && (
                          <PannelloSposta
                            stato={sposta}
                            massimo={i.quantity}
                            candidati={candidati}
                            setStato={setSposta}
                            onConferma={confermaSposta}
                            inCorso={busy === `sposta:${i.id}`}
                          />
                        )}
                      </li>
                    ))}

                    {/* Quota e coperto non sono consumazioni: si mostrano a
                        parte, altrimenti il totale sembrerebbe sbagliato.
                        Chi ha gia' pagato vede quello che ha effettivamente
                        versato, in una riga sola: il suo importo e' congelato
                        e ricalcolarne le parti non tornerebbe. */}
                    {p.paid
                      ? p.total - p.itemsTotal > 0 && (
                          <li
                            className="flex justify-between gap-3"
                            style={{ color: "var(--muted)" }}
                          >
                            <span>
                              {inSala ? "Quote e coperto" : "Consegna"}
                            </span>
                            <span className="tnum">
                              {fmt(p.total - p.itemsTotal)}
                            </span>
                          </li>
                        )
                      : (
                          <>
                            {/* Una riga per gruppo: chi ha diviso la pizza in
                                due e il vino con tutti deve vedere due voci
                                diverse, non una somma. */}
                            {p.shares.map((q) => (
                              <li
                                key={q.alias}
                                className="flex justify-between gap-3"
                                style={{ color: "var(--muted)" }}
                              >
                                <span>{q.label}</span>
                                <span className="tnum">{fmt(q.amountCents)}</span>
                              </li>
                            ))}
                            {p.coverCharge > 0 && (
                              <li
                                className="flex justify-between gap-3"
                                style={{ color: "var(--muted)" }}
                              >
                                <span>Coperto</span>
                                <span className="tnum">{fmt(p.coverCharge)}</span>
                              </li>
                            )}
                            {/* La consegna e' un servizio, non una
                                consumazione: senza una riga sua il totale di
                                chi ritira sembrerebbe sbagliato. */}
                            {t.deliveryFeeCents > 0 && (
                              <li
                                className="flex justify-between gap-3"
                                style={{ color: "var(--muted)" }}
                              >
                                <span>Consegna</span>
                                <span className="tnum">
                                  {fmt(t.deliveryFeeCents)}
                                </span>
                              </li>
                            )}
                          </>
                        )}
                  </ul>
                </div>
              ))}

              {/* Un riquadro per gruppo: "Condiviso" e' quello di tutto il
                  tavolo, gli altri portano i nomi di chi se li divide. */}
              {t.shared.map((g) => (
                <div
                  key={g.alias}
                  className="rounded-xl p-3"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div className="text-sm font-medium">
                    {g.alias}{" "}
                    <span className="font-normal" style={{ color: "var(--muted)" }}>
                      · diviso in {g.teste}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm" style={{ color: "var(--muted)" }}>
                    {g.items.map((i, idx) => (
                      <li key={i.id ?? idx}>
                        <div className="flex justify-between gap-3">
                          <span
                            style={
                              i.voided
                                ? { textDecoration: "line-through" }
                                : undefined
                            }
                          >
                            <span className="tnum">{i.quantity}×</span> {i.name}
                          </span>
                          <span className="flex items-center gap-2">
                            {i.voided && (
                              <span className="badge badge-muted">
                                annullato
                              </span>
                            )}
                            <AzioniVoce
                              item={i}
                              attive={modifica === t.key}
                              spostabile={inSala}
                              onAnnulla={() => annulla(i.id!, !i.voided)}
                              onSposta={() => apriSposta(i, g.alias, candidati)}
                              onNota={() => apriNota(i)}
                            />
                            <span
                              className="tnum"
                              style={
                                i.voided
                                  ? { textDecoration: "line-through" }
                                  : undefined
                              }
                            >
                              {fmt(i.priceCents * i.quantity)}
                            </span>
                          </span>
                        </div>
                        {nota && nota.itemId === i.id && (
                          <PannelloNota
                            testo={nota.testo}
                            scrivi={(v) =>
                              setNota((p) => (p ? { ...p, testo: v } : p))
                            }
                            salva={salvaNota}
                            chiudi={() => setNota(null)}
                            inCorso={busy === i.id}
                          />
                        )}
                        {sposta && sposta.itemId === i.id && (
                          <PannelloSposta
                            stato={sposta}
                            massimo={i.quantity}
                            candidati={candidati}
                            setStato={setSposta}
                            onConferma={confermaSposta}
                            inCorso={busy === `sposta:${i.id}`}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

            </div>

            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Lo scontrino fiscale lo emette la cassa.
              </span>
              <button
                onClick={() => stampaConto(t.key)}
                className="btn btn-sm ml-auto"
              >
                Stampa il conto
              </button>
              <button onClick={() => onCloseClick(t)} className="btn btn-sm">
                {saldato
                  ? inSala
                    ? "Chiudi tavolo"
                    : "Archivia"
                  : "Chiudi e salda il resto"}
              </button>
            </div>
          </section>
        );
      })}

      {confermaChiusura && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setConfermaChiusura(null)}
        >
          <div
            className="card w-full max-w-sm p-5"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold">Ordine ancora in corso</div>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              {confermaChiusura.label} ha ancora un ordine da preparare o in
              preparazione. Chiudendo, l&apos;ordine verrà segnato come servito.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfermaChiusura(null)}
                className="btn btn-sm"
              >
                Annulla
              </button>
              <button
                onClick={() => confirmClose(confermaChiusura.key)}
                className="btn btn-primary btn-sm"
              >
                Conferma chiusura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Le azioni su una voce del conto: toglierla, o riportarla su chi la paga
// davvero. Sono le stesse sotto una persona e dentro a un gruppo, e scritte
// due volte finirebbero prima o poi per non esserlo piu'.
function AzioniVoce({
  item,
  attive,
  spostabile,
  onAnnulla,
  onSposta,
  onNota,
}: {
  item: BillLine;
  attive: boolean;
  // Fuori dalla sala il conto e' di chi ritira e basta: non c'e' nessun altro
  // su cui spostare, e il bottone porterebbe a un vicolo cieco.
  spostabile: boolean;
  onAnnulla: () => void;
  onSposta: () => void;
  onNota: () => void;
}) {
  // Una riga gia' incassata non si tocca piu', ne' di qua ne' a database.
  if (!attive || !item.id || item.paid) return null;

  return (
    <>
      {/* «Senza cipolla» detto al telefono a ordine gia' partito, o scritto
          male da chi l'ha battuto. Non su una riga annullata: quella non la
          prepara piu' nessuno. */}
      {!item.voided && (
        <button
          onClick={onNota}
          className="text-xs underline"
          style={{ color: "var(--muted)" }}
        >
          {item.note ? "nota" : "+ nota"}
        </button>
      )}
      {/* Quella annullata non si sposta: non la paga nessuno, spostarla non
          vorrebbe dire niente. Prima si ripristina. */}
      {spostabile && !item.voided && (
        <button
          onClick={onSposta}
          className="text-xs underline"
          style={{ color: "var(--muted)" }}
        >
          sposta
        </button>
      )}
      <button
        onClick={onAnnulla}
        className="text-xs underline"
        style={{ color: item.voided ? "var(--brand-text)" : "var(--danger)" }}
      >
        {item.voided ? "ripristina" : "annulla"}
      </button>
    </>
  );
}

// Su chi finisce questa voce. Le persone sono quelle che il conto elenca gia',
// e accenderne due vuol dire dividerla tra loro: e' la stessa domanda che il
// cliente si e' sentito fare dal telefono, rifatta qui dove si paga.
function PannelloSposta({
  stato,
  massimo,
  candidati,
  setStato,
  onConferma,
  inCorso,
}: {
  stato: Spostamento;
  massimo: number;
  candidati: string[];
  setStato: Dispatch<SetStateAction<Spostamento | null>>;
  onConferma: (nomi: string[], quantita: number) => void;
  inCorso: boolean;
}) {
  const aTutti = stato.nomi.includes(ALIAS_CONDIVISO);
  const scritto = (stato.nuovo ?? "").trim();

  // I nomi da toccare sono quelli del tavolo piu' quelli scritti a mano, che
  // al conto non risultano finche' lo spostamento non e' fatto: senza, chi ne
  // aggiunge uno lo vede sparire e legge "Dividi tra 2" senza il secondo.
  const pillole = [
    ...candidati,
    ...stato.nomi.filter((n) => n !== ALIAS_CONDIVISO && !candidati.includes(n)),
  ];

  // Chi si sta scrivendo conta come gia' scelto: chi ha finito di digitare e
  // tocca il bottone ha finito, e chiedergli anche un invio prima vorrebbe
  // dire vedersi tornare indietro il nome che aveva appena messo.
  const scelti =
    scritto && !aTutti && !stato.nomi.includes(scritto)
      ? [...stato.nomi, scritto]
      : stato.nomi;

  // Scegliere una persona esce dal condiviso: sono due risposte alla stessa
  // domanda, e tenerle accese insieme non vorrebbe dire niente.
  function tocca(nome: string) {
    setStato((s) => {
      if (!s) return s;
      const soli = s.nomi.filter((n) => n !== ALIAS_CONDIVISO);
      return {
        ...s,
        nomi: soli.includes(nome)
          ? soli.filter((n) => n !== nome)
          : [...soli, nome],
        errore: null,
      };
    });
  }

  function chiudiNuovo() {
    setStato((s) => {
      if (!s) return s;
      const nome = (s.nuovo ?? "").trim();
      if (!nome) return { ...s, nuovo: null };
      const soli = s.nomi.filter((n) => n !== ALIAS_CONDIVISO);
      return {
        ...s,
        nomi: soli.includes(nome) ? soli : [...soli, nome],
        nuovo: null,
        errore: null,
      };
    });
  }

  const etichetta = aTutti
    ? "Metti in condiviso"
    : scelti.length === 0
      ? "Scegli chi la paga"
      : scelti.length === 1
        ? `Sposta su ${scelti[0]}`
        : `Dividi tra ${scelti.length}`;

  return (
    <div
      className="mb-1 mt-1.5 rounded-xl border p-2.5"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {/* Ne ha ordinate due e una era per un altro: si sposta solo quella. La
          riga si spezza, il resto resta dov'e'. */}
      {massimo > 1 && (
        <div className="flex items-center gap-1.5 text-sm">
          <span style={{ color: "var(--muted)" }}>Quante</span>
          <button
            onClick={() =>
              setStato((s) => s && { ...s, quantita: Math.max(1, s.quantita - 1) })
            }
            aria-label="Una in meno"
            className="btn btn-sm"
          >
            −
          </button>
          <span className="tnum w-6 text-center font-semibold">
            {stato.quantita}
          </span>
          <button
            onClick={() =>
              setStato(
                (s) => s && { ...s, quantita: Math.min(massimo, s.quantita + 1) }
              )
            }
            aria-label="Una in più"
            className="btn btn-sm"
          >
            +
          </button>
          <span style={{ color: "var(--muted)" }}>di {massimo}</span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {pillole.map((n) => (
          <button
            key={n}
            onClick={() => tocca(n)}
            aria-pressed={stato.nomi.includes(n)}
            className={"btn btn-sm" + (stato.nomi.includes(n) ? " btn-primary" : "")}
          >
            {n}
          </button>
        ))}

        {/* Al tavolo siede anche chi non ha ordinato niente: il suo nome non
            lo sa nessuno finche' qualcuno non lo scrive. */}
        {stato.nuovo === null ? (
          <button
            onClick={() => setStato((s) => s && { ...s, nuovo: "" })}
            className="btn btn-sm"
            style={{ color: "var(--muted)" }}
          >
            + nome
          </button>
        ) : (
          <input
            autoFocus
            value={stato.nuovo}
            maxLength={24}
            onChange={(e) =>
              setStato((s) => s && { ...s, nuovo: e.target.value, errore: null })
            }
            onBlur={chiudiNuovo}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                chiudiNuovo();
              }
            }}
            placeholder="Nome"
            aria-label="Nome di chi paga"
            className="input"
            style={{ width: 130, minHeight: 38 }}
          />
        )}

        <button
          onClick={() =>
            setStato(
              (s) =>
                s && {
                  ...s,
                  nomi: aTutti ? [] : [ALIAS_CONDIVISO],
                  nuovo: null,
                  errore: null,
                }
            )
          }
          aria-pressed={aTutti}
          className={"btn btn-sm" + (aTutti ? " btn-primary" : "")}
        >
          Tutto il tavolo
        </button>
      </div>

      {stato.errore && (
        <p
          role="status"
          className="mt-1.5 text-xs"
          style={{ color: "var(--danger)" }}
        >
          {stato.errore}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => onConferma(scelti, stato.quantita)}
          disabled={inCorso || !scelti.length}
          className="btn btn-primary btn-sm"
        >
          {inCorso ? "..." : etichetta}
        </button>
        <button onClick={() => setStato(null)} className="btn btn-sm">
          Lascia com&apos;è
        </button>
      </div>
    </div>
  );
}

// Il campo dove si riscrive la nota di una riga. Piccolo e sotto la voce: e'
// una correzione, non un modulo — e chi lo apre ha il cliente al telefono.
function PannelloNota({
  testo,
  scrivi,
  salva,
  chiudi,
  inCorso,
}: {
  testo: string;
  scrivi: (v: string) => void;
  salva: () => void;
  chiudi: () => void;
  inCorso: boolean;
}) {
  return (
    <div
      className="mt-1.5 rounded-lg border p-2"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      <input
        value={testo}
        onChange={(e) => scrivi(e.target.value)}
        maxLength={200}
        autoFocus
        placeholder="Senza cipolla, ben cotta…"
        aria-label="Nota della voce"
        className="input text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") salva();
          if (e.key === "Escape") chiudi();
        }}
      />
      <div className="mt-2 flex items-center gap-3">
        <button onClick={salva} disabled={inCorso} className="btn btn-sm">
          {inCorso ? "..." : "Salva la nota"}
        </button>
        <button
          onClick={chiudi}
          className="text-xs underline"
          style={{ color: "var(--muted)" }}
        >
          annulla
        </button>
        {/* La carta e' gia' uscita: la cucina non la rilegge da sola. */}
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          Se la comanda è già stampata, avvisa a voce.
        </span>
      </div>
    </div>
  );
}
