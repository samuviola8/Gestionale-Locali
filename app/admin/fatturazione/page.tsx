import { eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, payments } from "@/lib/db/schema";
import { richiediAdmin } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import {
  canoneMensileCents,
  etichettaPeriodo,
  getContratti,
  importoAScadenzaCents,
} from "@/lib/billing/contratti";
import {
  contrattiDaFatturare,
  mancanzeIntestatario,
  numeroDocumento,
  ultimiDocumenti,
} from "@/lib/billing/documenti";
import { getEmittente, mancanzeEmittente } from "@/lib/billing/emittente";
import { spiegaBlocco } from "@/lib/billing/blocco";
import {
  badgeContratto,
  badgeDocumento,
  dataBreve,
  etichettaContratto,
  etichettaDocumento,
  etichettaModello,
} from "@/lib/billing/stati";
import { preparaRinnoviAction } from "./actions";

// Il registro: chi paga cosa, cosa e' stato emesso, cosa non e' rientrato.
// Non e' un gestionale contabile e non ci prova: e' l'elenco che mi dice chi
// chiamare lunedi' mattina.

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default async function FatturazionePage() {
  await richiediAdmin();

  const emittente = getEmittente();
  const mancanze = mancanzeEmittente(emittente);

  const inizioMese = new Date();
  inizioMese.setDate(1);
  inizioMese.setHours(0, 0, 0, 0);

  const [locali, documenti, daFatturare, incassiMese, scaduto] = await Promise.all([
    getContratti(),
    ultimiDocumenti(40),
    contrattiDaFatturare(),
    db
      .select({ tot: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int` })
      .from(payments)
      .where(gte(payments.paidAt, inizioMese)),
    db
      .select({ tot: sql<number>`coalesce(sum(${invoices.totalCents}), 0)::int` })
      .from(invoices)
      .where(eq(invoices.status, "scaduto")),
  ]);

  const mrr = locali.reduce(
    (s, l) => s + (l.contratto ? canoneMensileCents(l.contratto, l.addonsCents) : 0),
    0
  );
  const inProva = locali.filter((l) => (l.contratto?.status ?? "prova") === "prova").length;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        <div>
          <a href="/admin" className="text-sm text-neutral-500 hover:underline">
            ← Panoramica
          </a>
          <h1 className="mt-2 text-2xl font-semibold">Fatturazione</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Cosa pagano i locali, cosa e&apos; stato emesso e cosa non e&apos;
            ancora rientrato.
          </p>
          <a
            href="/admin/fatturazione/listino"
            className="mt-2 inline-block text-sm hover:underline"
            style={{ color: "var(--brand-text)" }}
          >
            Listino e regole →
          </a>
        </div>

        {mancanze.length > 0 && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
          >
            <strong>Mancano i tuoi dati da emittente:</strong>{" "}
            {mancanze.join(", ")}. I conti si fanno lo stesso e le bozze si
            preparano, ma finche&apos; non compili le variabili{" "}
            <code>FATTURAZIONE_*</code> nessun documento si puo&apos; emettere.
          </div>
        )}

        {/* L'IBAN non blocca l'emissione — una fattura senza resta valida — ma
            se manca la riga "bonifico a IBAN, causale ..." sparisce dal
            documento, e il locale si ritrova una fattura da saldare senza
            sapere dove. Vale un promemoria, non un blocco. */}
        {mancanze.length === 0 && !emittente.iban && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          >
            <strong>Manca l&apos;IBAN</strong> (<code>FATTURAZIONE_IBAN</code>).
            Si emette lo stesso, ma sui documenti non compare dove pagare: chi
            salda con bonifico dovra&apos; chiedertelo.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Ricorrente al mese" value={formatPrice(mrr)} />
          <Stat label="Incassato questo mese" value={formatPrice(incassiMese[0]?.tot ?? 0)} />
          <Stat label="Scaduto" value={formatPrice(scaduto[0]?.tot ?? 0)} />
          <Stat label="In prova" value={inProva} />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              Scadenze arrivate
            </h2>
            <form action={preparaRinnoviAction}>
              <button
                className="btn btn-sm"
                style={{ border: "1px solid var(--border)" }}
                disabled={daFatturare.length === 0}
              >
                Prepara le bozze
              </button>
            </form>
          </div>
          <div className="card p-4 text-sm">
            {daFatturare.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>
                Nessuna scadenza da fatturare oggi.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {daFatturare.map((c) => (
                  <li key={c.tenantId} className="flex justify-between gap-4">
                    <span>{c.tenantName}</span>
                    <span className="tnum" style={{ color: "var(--muted)" }}>
                      {formatPrice(c.totaleCents)}{" "}
                      · scaduta il {dataBreve(c.nextInvoiceAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Contratti
          </h2>
          <div className="card overflow-hidden">
            {locali.length === 0 && (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                Nessun locale ancora.
              </p>
            )}
            {locali.map((l, i) => {
              const c = l.contratto;
              return (
                <div
                  key={l.tenantId}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm"
                  style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
                >
                  <div className="min-w-[160px] flex-1">
                    <a
                      href={`/admin/locali/${l.tenantId}`}
                      className="font-medium hover:underline"
                    >
                      {l.tenantName}
                    </a>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {c
                        ? `${etichettaModello(c.model)} · ${c.pack}`
                        : "Nessun contratto"}
                    </div>
                  </div>
                  <span className={`badge ${badgeContratto(c?.status ?? "prova")}`}>
                    {etichettaContratto(c?.status ?? "prova")}
                  </span>
                  {mancanzeIntestatario(l).length > 0 && (
                    <span className="badge badge-warn">
                      manca {mancanzeIntestatario(l).join(", ")}
                    </span>
                  )}
                  {l.serviceBlocked && (
                    <span className="badge badge-danger">
                      {spiegaBlocco(l.blockedReason)}
                    </span>
                  )}
                  <div className="tnum text-right">
                    <div className="font-medium">
                      {formatPrice(c ? importoAScadenzaCents(c, l.addonsCents) : 0)}
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {c ? etichettaPeriodo(c) : "—"}
                      {l.addonsCents > 0 && " · add-on inclusi"}
                    </div>
                  </div>
                  <div className="text-right text-xs" style={{ color: "var(--muted)" }}>
                    <div>Prossima</div>
                    <div className="tnum">
                      {dataBreve(c?.nextInvoiceAt ?? c?.trialEndsAt ?? null)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Documenti
          </h2>
          <div className="card overflow-hidden">
            {documenti.length === 0 && (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                Ancora nessun documento.
              </p>
            )}
            {documenti.map((d, i) => (
              <a
                key={d.id}
                href={`/admin/fatturazione/${d.id}`}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
                style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
              >
                <span className="tnum w-20 shrink-0" style={{ color: "var(--muted)" }}>
                  {numeroDocumento(d)}
                </span>
                <span className="min-w-[140px] flex-1 font-medium">{d.tenantName}</span>
                <span className={`badge ${badgeDocumento(d.status)}`}>
                  {etichettaDocumento(d.status)}
                </span>
                <span className="tnum w-24 text-right font-medium">
                  {formatPrice(d.totalCents)}
                </span>
                <span className="tnum w-24 text-right text-xs" style={{ color: "var(--muted)" }}>
                  {dataBreve(d.issuedAt ?? d.createdAt)}
                </span>
              </a>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
