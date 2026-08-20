import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { documentiDelLocale, numeroDocumento } from "@/lib/billing/documenti";
import { getContratto } from "@/lib/billing/contratti";
import { dataBreve } from "@/lib/billing/stati";

// Dove finisce chi ha il servizio spento. Non e' un muro: e' la pagina che
// dice cosa manca e da dove si riparte. Chi ci arriva ha il locale pieno e
// nessuna voglia di indovinare — quindi prima l'importo, poi come si paga.

export default async function SospesoPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const [locali, contratto, documenti] = await Promise.all([
    db
      .select({
        serviceBlocked: tenants.serviceBlocked,
        blockedReason: tenants.blockedReason,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1),
    getContratto(session.tenantId),
    documentiDelLocale(session.tenantId),
  ]);

  const locale = locali[0];
  // Rientrato il pagamento, questa pagina non ha piu' niente da dire.
  if (!locale?.serviceBlocked) redirect("/dashboard");

  const arretrate = documenti.filter(
    (d) => d.status === "emesso" || d.status === "scaduto"
  );
  const dovuto = arretrate.reduce((s, d) => s + d.totalCents, 0);
  const provaScaduta = locale.blockedReason === "prova_scaduta";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div
        className="rounded-xl px-5 py-4"
        style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
      >
        <h1 className="text-lg font-semibold">
          {provaScaduta ? "La prova e' finita" : "Servizio sospeso"}
        </h1>
        <p className="mt-1 text-sm">
          {provaScaduta
            ? "Il periodo di prova di questo locale e' scaduto: ordinazione al tavolo e pannello di lavoro sono fermi finche' non si attiva un abbonamento."
            : "Ordinazione al tavolo e pannello di lavoro sono fermi perche' una fattura non risulta saldata."}
        </p>
      </div>

      {dovuto > 0 && (
        <div className="card p-5">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              Da saldare
            </span>
            <span className="tnum text-2xl font-semibold">{formatPrice(dovuto)}</span>
          </div>
          <ul className="mt-4 space-y-1.5 text-sm">
            {arretrate.map((d) => (
              <li key={d.id} className="flex justify-between gap-4">
                <a
                  href={`/dashboard/fatturazione/${d.id}`}
                  className="hover:underline"
                  style={{ color: "var(--brand-text)" }}
                >
                  {numeroDocumento(d)}
                </a>
                <span className="tnum" style={{ color: "var(--muted)" }}>
                  {formatPrice(d.totalCents)} · scaduta il {dataBreve(d.dueAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card p-5 text-sm">
        <p>
          {provaScaduta
            ? "Per riaccendere tutto basta scegliere un piano: scrivici e lo attiviamo, i dati del locale, il menu e i tavoli sono rimasti dove erano."
            : "Appena il pagamento risulta registrato il servizio riparte da solo, senza dover rifare niente. Se il bonifico e' gia' partito, scrivicelo: riaccendiamo subito e aspettiamo l'accredito."}
        </p>
        {contratto?.provider === "manuale" && (
          <p className="mt-2" style={{ color: "var(--muted)" }}>
            Gli estremi per il bonifico sono in fondo a ogni fattura.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href="/dashboard/fatturazione" className="btn btn-primary btn-sm">
          Vedi le fatture
        </a>
        <a
          href="/dashboard/account"
          className="btn btn-sm"
          style={{ border: "1px solid var(--border)" }}
        >
          Il tuo accesso
        </a>
      </div>
    </div>
  );
}
