"use client";

import { useEffect, useState } from "react";
import { formatPrice as fmt } from "@/lib/format";
import type { BillTable } from "@/lib/bill";

export default function BillBoard({
  markAliasPaid,
  closeTable,
  setPartySize,
  voidItem,
  stampaConto,
}: {
  markAliasPaid: (key: string, alias: string) => Promise<void>;
  closeTable: (key: string) => Promise<void>;
  setPartySize: (key: string, partySize: number) => Promise<void>;
  stampaConto: (key: string) => Promise<void>;
  voidItem: (
    itemId: string,
    annulla: boolean
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
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

        const inSala = t.channel === "tavolo";

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
                </p>
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
                          {modifica === t.key && i.id && !i.paid && (
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
                            <span>
                              {inSala ? "Quota condiviso e coperto" : "Consegna"}
                            </span>
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
                          {modifica === t.key && i.id && !i.paid && (
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
