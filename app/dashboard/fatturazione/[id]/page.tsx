import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { documentoCompleto, numeroDocumento } from "@/lib/billing/documenti";
import {
  badgeDocumento,
  dataBreve,
  etichettaDocumento,
  etichettaMetodo,
} from "@/lib/billing/stati";

// Il documento come lo vede il locale: quello che il suo commercialista deve
// poter leggere e stampare. Niente bottoni, niente stato interno — qui non si
// amministra niente, si legge una fattura.

function Parte({ titolo, dati }: { titolo: string; dati: unknown }) {
  if (!dati || typeof dati !== "object") return null;
  const d = dati as Record<string, string | null>;
  return (
    <div>
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {titolo}
      </div>
      <div className="mt-1 text-sm">
        <div className="font-medium">{d.ragioneSociale ?? d.nome}</div>
        {d.indirizzo && (
          <div style={{ color: "var(--muted)" }}>
            {d.indirizzo}
            {d.cap && `, ${d.cap}`} {d.citta} {d.provincia && `(${d.provincia})`}
          </div>
        )}
        {d.partitaIva && (
          <div style={{ color: "var(--muted)" }}>P. IVA {d.partitaIva}</div>
        )}
      </div>
    </div>
  );
}

export default async function DocumentoLocalePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/dashboard");

  const { id } = await params;
  const dati = await documentoCompleto(id);

  // Un documento di un altro locale non esiste, non "e' vietato": rispondere
  // 403 direbbe a chi tira a indovinare che l'identificativo era buono.
  if (!dati || dati.documento.tenantId !== session.tenantId) notFound();
  if (dati.documento.status === "bozza") notFound();

  const { documento: d, righe, incassi, incassato } = dati;
  const residuo = Math.max(0, d.totalCents - incassato);
  const iban = (d.sellerSnapshot as Record<string, string> | null)?.iban;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <a
          href="/dashboard/fatturazione"
          className="text-sm hover:underline"
          style={{ color: "var(--muted)" }}
        >
          ← Abbonamento e fatture
        </a>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            {d.kind === "proforma" ? "Proforma" : "Fattura"} {numeroDocumento(d)}
          </h1>
          <span className={`badge ${badgeDocumento(d.status)}`}>
            {etichettaDocumento(d.status)}
          </span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Emessa il {dataBreve(d.issuedAt)}
          {d.dueAt && ` · da saldare entro il ${dataBreve(d.dueAt)}`}
        </p>
      </div>

      <div className="card grid gap-4 p-5 sm:grid-cols-2">
        <Parte titolo="Da" dati={d.sellerSnapshot} />
        <Parte titolo="A" dati={d.buyerSnapshot} />
      </div>

      <div className="card p-5">
        {d.periodStart && d.periodEnd && (
          <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
            Periodo dal {dataBreve(d.periodStart)} al {dataBreve(d.periodEnd)}
          </p>
        )}

        <div className="space-y-2 text-sm">
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
              <span style={{ color: "var(--muted)" }}>IVA {d.vatRateBps / 100}%</span>
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
        </div>

        {d.vatNote && (
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            {d.vatNote}
          </p>
        )}
      </div>

      {incassi.length > 0 && (
        <div className="card p-5 text-sm">
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
            Pagamenti registrati
          </div>
          <ul className="space-y-1.5">
            {incassi.map((p) => (
              <li key={p.id} className="flex justify-between gap-4">
                <span>{etichettaMetodo(p.method)}</span>
                <span className="tnum">
                  {formatPrice(p.amountCents)} · {dataBreve(p.paidAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {residuo > 0 && d.status !== "annullato" && (
        <div className="card p-5 text-sm">
          <div className="flex justify-between font-medium">
            <span>Da saldare</span>
            <span className="tnum">{formatPrice(residuo)}</span>
          </div>
          {iban && (
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Bonifico a {iban}, causale {numeroDocumento(d)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
