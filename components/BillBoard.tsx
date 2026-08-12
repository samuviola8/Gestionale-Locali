"use client";

import { useEffect, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";
import type { BillTable } from "@/lib/bill";

export default function BillBoard({
  markAliasPaid,
  closeTable,
  setPartySize,
  voidItem,
}: {
  markAliasPaid: (tableNumber: number, alias: string) => Promise<void>;
  closeTable: (tableNumber: number) => Promise<void>;
  setPartySize: (tableNumber: number, partySize: number) => Promise<void>;
  voidItem: (
    itemId: string,
    annulla: boolean
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [tables, setTables] = useState<BillTable[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmTable, setConfirmTable] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Un tavolo alla volta in modifica: le crocette sempre accese si toccano
  // per sbaglio proprio mentre si incassa.
  const [modifica, setModifica] = useState<number | null>(null);
  const [erroreVoce, setErroreVoce] = useState<string | null>(null);

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

  async function incassa(tableNumber: number, alias: string) {
    setBusy(`${tableNumber}:${alias}`);
    try {
      await markAliasPaid(tableNumber, alias);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function cambiaPersone(tableNumber: number, n: number) {
    await setPartySize(tableNumber, n);
    await load();
  }

  async function confirmClose(tableNumber: number) {
    setConfirmTable(null);
    await closeTable(tableNumber);
    load();
  }

  function onCloseClick(t: BillTable) {
    if (t.hasPending) setConfirmTable(t.tableNumber);
    else confirmClose(t.tableNumber);
  }

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
      {tables.map((t) => {
        const saldato = t.incassato >= t.total;
        const quota = t.total > 0 ? Math.round((t.incassato / t.total) * 100) : 0;
        const residuo = Math.max(0, t.total - t.incassato);

        return (
          <section key={t.tableNumber} className="card overflow-hidden">
            <div className="px-4 pt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-lg font-semibold">Tavolo {t.tableNumber}</h2>
                  {t.hasPending && (
                    <span className="badge badge-warn">Ordine in corso</span>
                  )}
                  <button
                    onClick={() => {
                      setErroreVoce(null);
                      setModifica(
                        modifica === t.tableNumber ? null : t.tableNumber
                      );
                    }}
                    className="text-xs underline"
                    style={{
                      color:
                        modifica === t.tableNumber
                          ? "var(--text)"
                          : "var(--muted)",
                    }}
                  >
                    {modifica === t.tableNumber ? "fine" : "modifica"}
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
                  perche' il cliente puo' averlo sbagliato. */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span style={{ color: "var(--muted)" }}>Persone al tavolo</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() =>
                      cambiaPersone(t.tableNumber, Math.max(1, t.partySize - 1))
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
                    onClick={() => cambiaPersone(t.tableNumber, t.partySize + 1)}
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

              {modifica === t.tableNumber && (
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Annulla quello che non è stato servito: esce dal totale e
                  resta barrato, così si sa sempre perché il conto è questo.
                </p>
              )}
              {modifica === t.tableNumber && erroreVoce && (
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
                        <span className="truncate font-medium">{p.alias}</span>
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
                        onClick={() => incassa(t.tableNumber, p.alias)}
                        disabled={busy === `${t.tableNumber}:${p.alias}`}
                        className="btn btn-primary btn-sm"
                      >
                        {busy === `${t.tableNumber}:${p.alias}`
                          ? "..."
                          : `Incassa ${fmt(p.total)}`}
                      </button>
                    )}
                  </div>

                  <ul className="mt-2 space-y-0.5 text-sm">
                    {p.items.map((i, idx) => (
                      <li key={i.id ?? idx} className="flex justify-between gap-3">
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
                            <span className="badge badge-muted">annullato</span>
                          )}
                          {modifica === t.tableNumber && i.id && !i.paid && (
                            <button
                              onClick={() => annulla(i.id!, !i.voided)}
                              className="text-xs underline"
                              style={{
                                color: i.voided
                                  ? "var(--brand-text)"
                                  : "var(--danger)",
                              }}
                            >
                              {i.voided ? "ripristina" : "annulla"}
                            </button>
                          )}
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
                            <span>Quota condiviso e coperto</span>
                            <span className="tnum">
                              {fmt(p.total - p.itemsTotal)}
                            </span>
                          </li>
                        )
                      : (
                          <>
                            {p.sharedQuota > 0 && (
                              <li
                                className="flex justify-between gap-3"
                                style={{ color: "var(--muted)" }}
                              >
                                <span>Quota condiviso</span>
                                <span className="tnum">{fmt(p.sharedQuota)}</span>
                              </li>
                            )}
                            {p.coverCharge > 0 && (
                              <li
                                className="flex justify-between gap-3"
                                style={{ color: "var(--muted)" }}
                              >
                                <span>Coperto</span>
                                <span className="tnum">{fmt(p.coverCharge)}</span>
                              </li>
                            )}
                          </>
                        )}
                  </ul>
                </div>
              ))}

              {t.sharedItems.length > 0 && (
                <div
                  className="rounded-xl p-3"
                  style={{ background: "var(--surface-2)" }}
                >
                  <div className="text-sm font-medium">
                    Condiviso{" "}
                    <span className="font-normal" style={{ color: "var(--muted)" }}>
                      · diviso in {t.partySize}
                    </span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm" style={{ color: "var(--muted)" }}>
                    {t.sharedItems.map((i, idx) => (
                      <li key={i.id ?? idx} className="flex justify-between gap-3">
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
                            <span className="badge badge-muted">annullato</span>
                          )}
                          {modifica === t.tableNumber && i.id && !i.paid && (
                            <button
                              onClick={() => annulla(i.id!, !i.voided)}
                              className="text-xs underline"
                              style={{
                                color: i.voided
                                  ? "var(--brand-text)"
                                  : "var(--danger)",
                              }}
                            >
                              {i.voided ? "ripristina" : "annulla"}
                            </button>
                          )}
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
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div
              className="mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              style={{ background: "var(--surface-2)" }}
            >
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Lo scontrino lo emette la cassa.
              </span>
              <button onClick={() => onCloseClick(t)} className="btn btn-sm">
                {saldato ? "Chiudi tavolo" : "Chiudi e salda il resto"}
              </button>
            </div>
          </section>
        );
      })}

      {confirmTable !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setConfirmTable(null)}
        >
          <div
            className="card w-full max-w-sm p-5"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-base font-semibold">Ordine ancora in corso</div>
            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              Il tavolo {confirmTable} ha ancora un ordine da preparare o in
              preparazione. Chiudendo, l&apos;ordine verrà segnato come servito.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmTable(null)} className="btn btn-sm">
                Annulla
              </button>
              <button
                onClick={() => confirmClose(confirmTable)}
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
