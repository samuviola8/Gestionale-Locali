import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getTenantModules, MODULES } from "@/lib/modules";
import { formatPrice } from "@/lib/format";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import {
  etichettaPeriodo,
  getContratto,
  importoAScadenzaCents,
  mesiPerScadenza,
} from "@/lib/billing/contratti";
import { getAddons } from "@/lib/billing/addons";
import {
  documentiDelLocale,
  mancanzeIntestatario,
  numeroDocumento,
} from "@/lib/billing/documenti";
import { getPacco, isPaccoKey } from "@/lib/billing/listino";
import {
  etichettaTipoFile,
  fileDelLocale,
  pesoLeggibile,
} from "@/lib/billing/archivio";
import {
  badgeContratto,
  badgeDocumento,
  dataBreve,
  etichettaContratto,
  etichettaDocumento,
} from "@/lib/billing/stati";
import { salvaDatiFatturazione } from "./actions";

// Cosa vede il locale del proprio conto: quanto paga, quando scade, e i
// documenti. Le bozze non compaiono — finche' non sono emesse non esistono
// per lui, e vedersi arrivare un importo che poi cambia e' il modo migliore
// per ricevere una telefonata inutile.

export default async function FatturazioneLocalePage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/dashboard");

  const [contratto, tutti, moduli, allegati, addons, locali] = await Promise.all([
    getContratto(session.tenantId),
    documentiDelLocale(session.tenantId),
    getTenantModules(session.tenantId),
    // Solo quelli marcati come visibili: il contratto firmato si', i miei
    // appunti su di lui no.
    fileDelLocale(session.tenantId, true),
    getAddons(session.tenantId),
    db.select().from(tenants).where(eq(tenants.id, session.tenantId)).limit(1),
  ]);

  const locale = locali[0];
  const documenti = tutti.filter((d) => d.status !== "bozza");
  const attivi = MODULES.filter((m) => moduli[m.key]);
  const pacco = contratto && isPaccoKey(contratto.pack) ? getPacco(contratto.pack) : null;
  const daPagare = documenti.filter(
    (d) => d.status === "emesso" || d.status === "scaduto"
  );

  // Il canone del pacchetto non e' quello che paga: gli add-on ci si sommano.
  // Mostrarlo da solo qui vorrebbe dire far litigare questa pagina con la
  // fattura che arriva il mese dopo.
  const addonsCents = addons.reduce((s, a) => s + a.priceCents, 0);
  const totale = contratto ? importoAScadenzaCents(contratto, addonsCents) : 0;
  const mesiAddon = contratto ? mesiPerScadenza(contratto) : 1;
  const mancanze = mancanzeIntestatario(locale);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Abbonamento e fatture</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Il tuo piano e i documenti che ti abbiamo emesso.
        </p>
      </div>

      {!contratto || contratto.status === "chiuso" ? (
        <div className="card p-5 text-sm" style={{ color: "var(--muted)" }}>
          Non c&apos;e&apos; nessun contratto attivo su questo locale.
        </div>
      ) : (
        <div className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold">
                  {pacco ? pacco.label : "Su misura"}
                </span>
                <span className={`badge ${badgeContratto(contratto.status)}`}>
                  {etichettaContratto(contratto.status)}
                </span>
              </div>
              {pacco && (
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                  {pacco.descrizione}
                </p>
              )}
            </div>
            {contratto.status !== "prova" && (
              <div className="text-right">
                <div className="tnum text-lg font-semibold">
                  {formatPrice(totale)}
                </div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {etichettaPeriodo(contratto)}
                </div>
              </div>
            )}
          </div>

          {contratto.status !== "prova" && addonsCents > 0 && (
            <div
              className="mt-4 space-y-1 pt-3 text-sm"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <div className="flex justify-between gap-4">
                <span style={{ color: "var(--muted)" }}>
                  {pacco ? pacco.label : "Canone"}
                </span>
                <span className="tnum">{formatPrice(contratto.recurringCents)}</span>
              </div>
              {addons.map((a) => (
                <div key={a.moduleKey} className="flex justify-between gap-4">
                  <span style={{ color: "var(--muted)" }}>
                    {a.label}
                    {mesiAddon > 1 && (
                      <span className="text-xs"> × {mesiAddon} mesi</span>
                    )}
                  </span>
                  <span className="tnum">
                    {formatPrice(a.priceCents * mesiAddon)}
                  </span>
                </div>
              ))}
              <div className="flex justify-between gap-4 pt-1 font-medium">
                <span>Totale</span>
                <span className="tnum">{formatPrice(totale)}</span>
              </div>
            </div>
          )}

          <div
            className="mt-4 grid gap-3 pt-4 text-sm sm:grid-cols-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {contratto.status === "prova" ? "La prova finisce il" : "Prossimo rinnovo"}
              </div>
              <div className="tnum mt-0.5">
                {dataBreve(
                  contratto.status === "prova"
                    ? contratto.trialEndsAt
                    : contratto.nextInvoiceAt
                )}
              </div>
            </div>
            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Come paghi
              </div>
              <div className="mt-0.5">
                {contratto.provider === "stripe"
                  ? "Carta, addebito automatico"
                  : contratto.provider === "paypal"
                    ? "PayPal"
                    : "Bonifico"}
              </div>
            </div>
          </div>

          {contratto.transactionBps > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
              Sui pagamenti che i clienti fanno dal telefono tratteniamo il{" "}
              {(contratto.transactionBps / 100).toString().replace(".", ",")}%
              come quota piattaforma, fatturata a fine mese.
            </p>
          )}

          <div className="mt-4">
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Cosa hai attivo
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {attivi.map((m) => (
                <span key={m.key} className="badge badge-muted">
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {daPagare.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
        >
          {daPagare.length === 1
            ? "C'e' un documento da saldare."
            : `Ci sono ${daPagare.length} documenti da saldare.`}
        </div>
      )}

      {/* Si compilano una volta e non si guardano piu': aperto di default
          starebbe in mezzo ogni volta che il titolare viene qui a controllare
          una fattura. Resta aperto finche' manca qualcosa — li' e' il motivo
          per cui e' venuto. */}
      <details className="disclosure" open={mancanze.length > 0}>
        <summary>
          I tuoi dati per la fattura
          {mancanze.length > 0 ? (
            <span className="badge badge-warn ml-1">da completare</span>
          ) : (
            <span className="ml-1 text-xs font-normal" style={{ color: "var(--muted)" }}>
              {locale.legalName} · P. IVA {locale.vatNumber}
            </span>
          )}
        </summary>
        <div className="disclosure-body">
          {mancanze.length > 0 && (
            <div
              className="mb-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
            >
              Per poterti fatturare ci manca <strong>{mancanze.join(", ")}</strong>.
              Compilali qui sotto: sono quelli che finiscono sulla fattura, e
              servono una volta sola.
            </div>
          )}

        <form
          action={salvaDatiFatturazione}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="text-sm sm:col-span-2">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Ragione sociale
            </span>
            <input
              name="legalName"
              defaultValue={locale.legalName ?? ""}
              placeholder="Come sei registrato, non l'insegna"
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm sm:col-span-2">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Indirizzo della sede
            </span>
            <input
              name="address"
              defaultValue={locale.address ?? ""}
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              CAP
            </span>
            <input
              name="postalCode"
              defaultValue={locale.postalCode ?? ""}
              inputMode="numeric"
              maxLength={5}
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Citta&apos;
            </span>
            <input
              name="city"
              defaultValue={locale.city ?? ""}
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Provincia
            </span>
            <input
              name="province"
              defaultValue={locale.province ?? ""}
              maxLength={2}
              placeholder="MI"
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Partita IVA
            </span>
            <input
              name="vatNumber"
              defaultValue={locale.vatNumber ?? ""}
              inputMode="numeric"
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Codice fiscale
            </span>
            <input
              name="taxCode"
              defaultValue={locale.taxCode ?? ""}
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Codice destinatario SDI
            </span>
            <input
              name="sdiCode"
              defaultValue={locale.sdiCode ?? ""}
              maxLength={7}
              placeholder="7 caratteri"
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              PEC
            </span>
            <input
              name="pecEmail"
              type="email"
              defaultValue={locale.pecEmail ?? ""}
              className="input mt-1 w-full"
            />
          </label>

          <label className="text-sm sm:col-span-2">
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Dove mandare le fatture
            </span>
            <input
              name="billingEmail"
              type="email"
              defaultValue={locale.billingEmail ?? ""}
              placeholder={locale.contactEmail ?? "amministrazione@..."}
              className="input mt-1 w-full"
            />
          </label>

          <p className="text-xs sm:col-span-2" style={{ color: "var(--muted)" }}>
            Codice destinatario e PEC sono alternativi: al Sistema di
            Interscambio ne basta uno, e se non sai quale sia chiedilo al tuo
            commercialista — e&apos; una domanda da trenta secondi. Se non li
            metti, la fattura ti arriva lo stesso per email.
          </p>

          <div className="sm:col-span-2">
            <button className="btn btn-primary btn-sm">Salva i dati</button>
          </div>
        </form>
        </div>
      </details>

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
          Documenti
        </h2>
        <div className="card overflow-hidden">
          {documenti.length === 0 && (
            <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              Ancora nessuna fattura.
            </p>
          )}
          {documenti.map((d, i) => (
            <a
              key={d.id}
              href={`/dashboard/fatturazione/${d.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
              style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
            >
              <span className="tnum w-20 shrink-0" style={{ color: "var(--muted)" }}>
                {numeroDocumento(d)}
              </span>
              <span className="min-w-[120px] flex-1 text-xs" style={{ color: "var(--muted)" }}>
                {dataBreve(d.issuedAt)}
                {d.dueAt && d.status !== "pagato" && ` · scade il ${dataBreve(d.dueAt)}`}
              </span>
              <span className={`badge ${badgeDocumento(d.status)}`}>
                {etichettaDocumento(d.status)}
              </span>
              <span className="tnum w-24 text-right font-medium">
                {formatPrice(d.totalCents)}
              </span>
            </a>
          ))}
        </div>
      </section>

      {allegati.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Contratti e documenti
          </h2>
          <div className="card overflow-hidden">
            {allegati.map((f, i) => (
              <a
                key={f.id}
                href={`/api/documenti/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
                style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
              >
                <span className="min-w-[140px] flex-1 font-medium">{f.title}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {etichettaTipoFile(f.kind)} · {pesoLeggibile(f.sizeBytes)} ·{" "}
                  {dataBreve(f.uploadedAt)}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
