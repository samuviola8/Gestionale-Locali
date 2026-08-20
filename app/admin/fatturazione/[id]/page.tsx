import { notFound } from "next/navigation";
import { richiediAdmin } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/format";
import {
  documentoCompleto,
  mancanzeIntestatario,
  numeroDocumento,
} from "@/lib/billing/documenti";
import { mancanzeEmittente } from "@/lib/billing/emittente";
import {
  METODI,
  badgeDocumento,
  dataBreve,
  etichettaDocumento,
  etichettaMetodo,
} from "@/lib/billing/stati";
import { annullaAction, eliminaBozzaAction, emettiAction, incassoAction } from "../actions";

export default async function DocumentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await richiediAdmin();
  const { id } = await params;

  const dati = await documentoCompleto(id);
  if (!dati) notFound();

  const { documento: d, righe, incassi, locale, incassato } = dati;
  const residuo = Math.max(0, d.totalCents - incassato);
  const mancanze = mancanzeEmittente();
  // Due elenchi diversi: quello che manca a me da emittente, e quello che
  // manca a lui da intestatario. Senza distinguerli, davanti a "non si puo'
  // emettere" non si sa quale delle due schede aprire.
  const mancanzeLocale = mancanzeIntestatario(locale);
  const bloccanti = [...mancanze, ...mancanzeLocale];
  const bozza = d.status === "bozza";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <a
            href="/admin/fatturazione"
            className="text-sm text-neutral-500 hover:underline"
          >
            ← Fatturazione
          </a>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {d.kind === "proforma" ? "Proforma" : "Fattura"} {numeroDocumento(d)}
            </h1>
            <span className={`badge ${badgeDocumento(d.status)}`}>
              {etichettaDocumento(d.status)}
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {locale.name}
            {d.issuedAt && ` · emessa il ${dataBreve(d.issuedAt)}`}
            {d.dueAt && ` · scade il ${dataBreve(d.dueAt)}`}
          </p>
        </div>

        {bozza && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "var(--surface-2)", color: "var(--muted)" }}
          >
            E&apos; una bozza: non ha ancora un numero e il locale non la vede.
            All&apos;emissione prende il progressivo e i dati di entrambe le
            parti restano congelati com&apos;erano quel giorno.
          </div>
        )}

        <section className="card p-4 text-sm">
          <h2 className="mb-3 text-xs font-medium uppercase" style={{ color: "var(--muted)" }}>
            Righe
          </h2>
          <div className="space-y-2">
            {righe.map((r) => (
              <div key={r.id} className="flex justify-between gap-4">
                <span>
                  {r.description}
                  {r.quantity > 1 && (
                    <span style={{ color: "var(--muted)" }}> × {r.quantity}</span>
                  )}
                </span>
                <span className="tnum shrink-0">{formatPrice(r.totalCents)}</span>
              </div>
            ))}
          </div>

          <div
            className="mt-4 space-y-1.5 pt-3 text-sm"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--muted)" }}>Imponibile</span>
              <span className="tnum">{formatPrice(d.subtotalCents)}</span>
            </div>
            {d.vatCents > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "var(--muted)" }}>
                  IVA {d.vatRateBps / 100}%
                </span>
                <span className="tnum">{formatPrice(d.vatCents)}</span>
              </div>
            )}
            {d.stampCents > 0 && (
              <div className="flex justify-between">
                <span style={{ color: "var(--muted)" }}>Marca da bollo</span>
                <span className="tnum">{formatPrice(d.stampCents)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <span>Totale</span>
              <span className="tnum">{formatPrice(d.totalCents)}</span>
            </div>
            {incassato > 0 && (
              <div className="flex justify-between" style={{ color: "var(--muted)" }}>
                <span>Incassato</span>
                <span className="tnum">
                  {formatPrice(incassato)}
                  {residuo > 0 && ` · resta ${formatPrice(residuo)}`}
                </span>
              </div>
            )}
          </div>

          {d.vatNote && (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              {d.vatNote}
            </p>
          )}
        </section>

        {!bozza && (
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
              Intestata a
            </h2>
            <div className="card p-4 text-sm">
              <Snapshot dati={d.buyerSnapshot} />
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Incassi
          </h2>
          <div className="card p-4 text-sm">
            {incassi.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>Ancora niente.</p>
            ) : (
              <ul className="mb-4 space-y-1.5">
                {incassi.map((p) => (
                  <li key={p.id} className="flex justify-between gap-4">
                    <span>
                      {etichettaMetodo(p.method)}
                      {p.providerRef && (
                        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                          {p.providerRef}
                        </span>
                      )}
                    </span>
                    <span className="tnum shrink-0">
                      {formatPrice(p.amountCents)} · {dataBreve(p.paidAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {!bozza && d.status !== "annullato" && residuo > 0 && (
              <form action={incassoAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="tenantId" value={d.tenantId} />
                <label className="text-xs" style={{ color: "var(--muted)" }}>
                  Importo
                  <input
                    name="amount"
                    defaultValue={(residuo / 100).toFixed(2).replace(".", ",")}
                    className="input mt-1 w-28"
                    inputMode="decimal"
                  />
                </label>
                <label className="text-xs" style={{ color: "var(--muted)" }}>
                  Come
                  <select name="method" className="input mt-1" defaultValue="bonifico">
                    {METODI.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-[140px] flex-1 text-xs" style={{ color: "var(--muted)" }}>
                  Riferimento
                  <input
                    name="providerRef"
                    placeholder="pi_… / CRO"
                    className="input mt-1 w-full"
                  />
                </label>
                <button className="btn btn-primary btn-sm">Segna incassato</button>
              </form>
            )}
          </div>
        </section>

        <section className="flex flex-wrap gap-2">
          {bozza && (
            <>
              <form action={emettiAction}>
                <input type="hidden" name="id" value={d.id} />
                <button className="btn btn-primary btn-sm" disabled={bloccanti.length > 0}>
                  Emetti
                </button>
              </form>
              <form action={eliminaBozzaAction}>
                <input type="hidden" name="id" value={d.id} />
                <button
                  className="btn btn-sm"
                  style={{ border: "1px solid var(--border)", color: "var(--danger)" }}
                >
                  Elimina bozza
                </button>
              </form>
            </>
          )}
          {!bozza && d.status !== "annullato" && (
            <form action={annullaAction}>
              <input type="hidden" name="id" value={d.id} />
              <button
                className="btn btn-sm"
                style={{ border: "1px solid var(--border)", color: "var(--danger)" }}
              >
                Annulla documento
              </button>
            </form>
          )}
        </section>

        {bozza && mancanze.length > 0 && (
          <p className="text-xs" style={{ color: "var(--warn)" }}>
            A te da emittente mancano: {mancanze.join(", ")}. Si compilano nelle
            variabili <code>FATTURAZIONE_*</code>.
          </p>
        )}

        {bozza && mancanzeLocale.length > 0 && (
          <p className="text-xs" style={{ color: "var(--warn)" }}>
            A {locale.name} manca {mancanzeLocale.join(", ")}:{" "}
            <a
              href={`/admin/locali/`}
              className="underline"
            >
              completa i dati per la fattura sulla sua scheda
            </a>
            .
          </p>
        )}

        {d.sdiStatus && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Sistema di Interscambio: {d.sdiStatus}. L&apos;invio parte quando
            sara&apos; collegato un provider — il documento e i dati per farlo
            ci sono gia&apos; tutti.
          </p>
        )}
      </main>
    </div>
  );
}

// I dati congelati nel documento, non quelli di oggi: se il locale ha
// cambiato ragione sociale la fattura vecchia deve continuare a dire quella
// vecchia.
function Snapshot({ dati }: { dati: unknown }) {
  if (!dati || typeof dati !== "object") {
    return <span style={{ color: "var(--muted)" }}>—</span>;
  }
  const d = dati as Record<string, string | null>;
  return (
    <div className="space-y-0.5">
      <div className="font-medium">{d.nome}</div>
      {d.indirizzo && (
        <div style={{ color: "var(--muted)" }}>
          {d.indirizzo}
          {d.cap && `, ${d.cap}`} {d.citta} {d.provincia && `(${d.provincia})`}
        </div>
      )}
      {d.partitaIva && (
        <div style={{ color: "var(--muted)" }}>P. IVA {d.partitaIva}</div>
      )}
      {(d.sdiCode || d.pec) && (
        <div style={{ color: "var(--muted)" }}>
          {d.sdiCode ? `SDI ${d.sdiCode}` : `PEC ${d.pec}`}
        </div>
      )}
    </div>
  );
}
