import { notFound } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tenants,
  users,
  orders,
  orderItems,
  menuProducts,
  restaurantTables,
} from "@/lib/db/schema";
import { richiediAdmin } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/menu";
import { MODULES, getTenantModules } from "@/lib/modules";
import { THEME_PRESETS } from "@/lib/themes";
import { SKIN_CATALOGO } from "@/lib/skins";
import { getPacchetti, getPrezziModuli } from "@/lib/billing/prezzi";
import { etichettaPeriodo, getContratto } from "@/lib/billing/contratti";
import { getAddons, totaleAddonsCents } from "@/lib/billing/addons";
import { getImpostazioni } from "@/lib/billing/impostazioni";
import { spiegaBlocco } from "@/lib/billing/blocco";
import {
  avvisiIntestatario,
  documentiDelLocale,
  mancanzeIntestatario,
  numeroDocumento,
} from "@/lib/billing/documenti";
import {
  TIPI_FILE,
  etichettaTipoFile,
  fileDelLocale,
  pesoLeggibile,
} from "@/lib/billing/archivio";
import {
  STATI_CONTRATTO,
  badgeDocumento,
  dataBreve,
  etichettaDocumento,
} from "@/lib/billing/stati";
import DeleteLocaleButton from "@/components/DeleteLocaleButton";
import AccessiLocale from "@/components/AccessiLocale";
import IndirizzoWebLocale from "@/components/IndirizzoWebLocale";
import {
  saveAnagrafica,
  cambiaIndirizzoWeb,
  toggleSuspend,
  deleteLocale,
  saveModules,
  saveBranding,
  saveService,
  toggleDueFattori,
  resettaAccesso,
  azzeraAccessoDueFattori,
  saveContratto,
  saveDatiFiscali,
  impostaProvaAction,
  sbloccaAction,
  bloccaAction,
  caricaFileAction,
  eliminaFileAction,
} from "./actions";

// 4900 -> "49,00", per riempire una casella che si scrive in euro.
function inEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const input = "input";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default async function LocaleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creato?: string; invito?: string; file?: string }>;
}) {
  await richiediAdmin();

  const { id } = await params;
  const { creato, invito, file: erroreFile } = await searchParams;
  const t = (
    await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  )[0];
  if (!t) notFound();

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const allOrders = await db
    .select({ id: orders.id, createdAt: orders.createdAt })
    .from(orders)
    .where(eq(orders.tenantId, id));
  const ordersToday = allOrders.filter(
    (o) => o.createdAt.getTime() >= start.getTime()
  ).length;
  const orderIds = allOrders.map((o) => o.id);
  const items = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];
  const incassoTot = items
    .filter((i) => i.paid)
    .reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const staff = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      metodo: users.twofaMethod,
      daCambiare: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.tenantId, id));
  const prodCount = (
    await db.select({ id: menuProducts.id }).from(menuProducts).where(eq(menuProducts.tenantId, id))
  ).length;
  const tableCount = (
    await db
      .select({ id: restaurantTables.id })
      .from(restaurantTables)
      .where(eq(restaurantTables.tenantId, id))
  ).length;

  const modules = await getTenantModules(id);
  const contratto = await getContratto(id);
  const documenti = await documentiDelLocale(id);
  const addons = await getAddons(id);
  const totaleAddons = await totaleAddonsCents(id);
  const prezziModuli = await getPrezziModuli();
  const pacchetti = await getPacchetti();
  const impostazioni = await getImpostazioni();
  // I moduli gia' dentro il pacchetto firmato. Sono compresi nel canone e non
  // si fatturano a parte: farli pagare due volte e' il tipo di errore che il
  // cliente scopre prima di me.
  const inPacco = new Set(
    pacchetti.find((p) => p.key === contratto?.pack)?.moduli ?? []
  );
  const file = await fileDelLocale(id);
  const mancanzeFattura = mancanzeIntestatario(t);
  const avvisiFattura = avvisiIntestatario(t);

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        {creato && (
          <div
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--brand)",
              background: "var(--brand-50)",
              color: "var(--brand-text)",
            }}
          >
            <strong>Locale creato.</strong> Restano da fare: caricare il menu
            reale (prodotti e prezzi) e stampare i QR dei tavoli dalla dashboard
            del locale.
            {invito === "inviata" && (
              <span className="mt-1 block">
                L&apos;invito è partito: il titolare ha in casella il link e la
                sua password temporanea.
              </span>
            )}
          </div>
        )}

        {creato && invito && invito !== "inviata" && (
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
          >
            <strong>L&apos;invito non è partito</strong>{" "}
            {invito === "senza-posta"
              ? "perché non c'è nessuna casella configurata per mandarlo."
              : "per un errore della posta."}{" "}
            Il locale c&apos;è: qui sotto, in <em>Account</em>, fai «Reset e
            mostrala qui» e detta tu le credenziali al titolare.
          </div>
        )}

        <div>
          <a href="/admin" className="text-sm text-neutral-500 hover:underline">
            ← Panoramica
          </a>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{t.name}</h1>
            {t.suspended && (
              <span className="badge badge-warn">Sospeso</span>
            )}
          </div>
          <a
            href={`${proto}://${t.slug}.${root}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-[var(--brand-text)]"
          >
            {t.slug}.{root}
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Ordini oggi" value={ordersToday} />
          <Stat label="Ordini totali" value={allOrders.length} />
          <Stat label="Incasso totale" value={formatPrice(incassoTot)} />
          <Stat label="Utenti" value={staff.length} />
          <Stat label="Prodotti menu" value={prodCount} />
          <Stat label="Tavoli" value={tableCount} />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Anagrafica</h2>
          <form action={saveAnagrafica} className="card grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Nome del locale
              </span>
              <input name="name" defaultValue={t.name} className="input mt-1 w-full" />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Ragione sociale
              </span>
              <input
                name="legalName"
                defaultValue={t.legalName ?? ""}
                placeholder="Noya Lounge S.r.l.s."
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Indirizzo
              </span>
              <input
                name="address"
                defaultValue={t.address ?? ""}
                placeholder="Via Roma 12"
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Citta&apos;
              </span>
              <input name="city" defaultValue={t.city ?? ""} className="input mt-1 w-full" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  CAP
                </span>
                <input
                  name="postalCode"
                  defaultValue={t.postalCode ?? ""}
                  className="input mt-1 w-full"
                />
              </label>
              <label className="text-sm">
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  Provincia
                </span>
                <input
                  name="province"
                  defaultValue={t.province ?? ""}
                  maxLength={2}
                  placeholder="CT"
                  className="input mt-1 w-full"
                />
              </label>
            </div>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Telefono
              </span>
              <input name="phone" defaultValue={t.phone ?? ""} className="input mt-1 w-full" />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Referente
              </span>
              <input
                name="contactName"
                defaultValue={t.contactName ?? ""}
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Email referente
              </span>
              <input
                name="contactEmail"
                type="email"
                defaultValue={t.contactEmail ?? ""}
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Note
              </span>
              <textarea
                name="notes"
                rows={2}
                defaultValue={t.notes ?? ""}
                className="input mt-1 w-full"
              />
            </label>
            <p className="text-xs sm:col-span-2" style={{ color: "var(--muted)" }}>
              Ragione sociale e indirizzo sono quelli che finiscono sulle
              fatture del locale. Cambiando l&apos;indirizzo, la zona da cui la
              cassa propone le consegne si ricalcola da sola.
            </p>
            <div className="sm:col-span-2">
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                Salva anagrafica
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Account</h2>
          <AccessiLocale
            utenti={staff}
            resetta={resettaAccesso}
            azzera={azzeraAccessoDueFattori}
          />

          <form
            action={toggleDueFattori}
            className="card mt-3 flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <input type="hidden" name="id" value={t.id} />
            <span className="text-sm">
              <span className="block font-medium">
                Verifica in due passaggi obbligatoria
              </span>
              <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                {t.twofaRequired
                  ? "Chi non ce l'ha se la configura al primo accesso, e non può toglierla."
                  : "Ognuno decide per sé dalle proprie impostazioni."}
              </span>
            </span>
            <button className="btn btn-sm">
              {t.twofaRequired ? "Rendi facoltativa" : "Rendila obbligatoria"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Moduli e prezzi
          </h2>
          <form action={saveModules} className="card p-4">
            <input type="hidden" name="id" value={t.id} />

            <div className="space-y-1">
              {MODULES.map((m) => {
                const compreso = inPacco.has(m.key);
                const attivo = addons.find((a) => a.moduleKey === m.key);
                // Si fattura a parte solo quello che ha un prezzo suo e non e'
                // gia' dentro il pacchetto. Il resto o e' compreso, o e' di
                // servizio e non si vende da solo.
                const sePagante = !compreso && prezziModuli[m.key] > 0;
                return (
                  <div
                    key={m.key}
                    className="flex flex-wrap items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]"
                  >
                    <label className="flex min-w-[220px] flex-1 items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        name={`modulo_${m.key}`}
                        defaultChecked={modules[m.key]}
                        disabled={m.comingSoon}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{m.label}</span>
                        {compreso && (
                          <span className="ml-2 badge badge-muted">
                            nel pacchetto
                          </span>
                        )}
                        {m.comingSoon && (
                          <span className="ml-2 text-[10px] text-neutral-400">
                            in sviluppo
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-neutral-500">
                          {m.description}
                        </span>
                      </span>
                    </label>

                    <div className="flex shrink-0 items-center gap-2 pt-0.5">
                      {sePagante ? (
                        <>
                          <input
                            name={`prezzo_${m.key}`}
                            defaultValue={inEuro(
                              attivo?.priceCents ?? prezziModuli[m.key]
                            )}
                            inputMode="decimal"
                            aria-label={`Prezzo di ${m.label}`}
                            className="input w-24 text-right"
                          />
                          <span
                            className="w-14 text-xs"
                            style={{ color: "var(--muted)" }}
                          >
                            al mese
                          </span>
                        </>
                      ) : (
                        <span
                          className="w-[152px] text-right text-xs"
                          style={{ color: "var(--muted)" }}
                        >
                          {compreso ? "nel canone" : "senza costo"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 text-sm"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <span style={{ color: "var(--muted)" }}>
                Canone {formatPrice(contratto?.recurringCents ?? 0)}
                {totaleAddons > 0 && (
                  <> + add-on {formatPrice(totaleAddons)}</>
                )}{" "}
                ={" "}
                <strong style={{ color: "var(--fg)" }}>
                  {formatPrice((contratto?.recurringCents ?? 0) + totaleAddons)}
                </strong>{" "}
                {contratto ? etichettaPeriodo(contratto) : ""}
              </span>
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                Salva moduli e prezzi
              </button>
            </div>

            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Spegnere un modulo toglie anche il suo prezzo: acceso e non
              fatturato non deve poter succedere. Quelli del pacchetto sono gia&apos;
              dentro il canone e non si pagano due volte — cambiando pacchetto,
              chi ci entra smette di essere un add-on. Il prezzo proposto e&apos;
              quello di{" "}
              <a
                href="/admin/fatturazione/listino"
                className="hover:underline"
                style={{ color: "var(--brand-text)" }}
              >
                listino
              </a>
              : correggilo e resta quello concordato con lui.
            </p>
          </form>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              Contratto
            </h2>
            <a
              href="/admin/fatturazione"
              className="text-xs hover:underline"
              style={{ color: "var(--brand-text)" }}
            >
              Registro fatturazione →
            </a>
          </div>
          <form action={saveContratto} className="card grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Come paga
              </span>
              <select
                name="model"
                defaultValue={contratto?.model ?? "abbonamento"}
                className="input mt-1 w-full"
              >
                <option value="abbonamento">Abbonamento</option>
                <option value="impianto">Impianto + assistenza</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Pacchetto
              </span>
              <select
                name="pack"
                defaultValue={contratto?.pack ?? "sala"}
                className="input mt-1 w-full"
              >
                {pacchetti.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} — {formatPrice(p.mensileCents)}/mese
                  </option>
                ))}
                <option value="su_misura">Su misura</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Ogni quanto
              </span>
              <select
                name="period"
                defaultValue={contratto?.period ?? "mensile"}
                className="input mt-1 w-full"
              >
                <option value="mensile">Mensile</option>
                <option value="annuale">Annuale</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Canone a scadenza (€)
              </span>
              <input
                name="recurring"
                defaultValue={inEuro(contratto?.recurringCents ?? 0)}
                inputMode="decimal"
                className="input mt-1 w-full"
              />
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Attivazione una tantum (€)
              </span>
              <input
                name="activation"
                defaultValue={inEuro(contratto?.activationCents ?? 0)}
                inputMode="decimal"
                className="input mt-1 w-full"
              />
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Quota sul transato (%)
              </span>
              <input
                name="transactionPct"
                defaultValue={((contratto?.transactionBps ?? 0) / 100)
                  .toFixed(2)
                  .replace(".", ",")}
                inputMode="decimal"
                className="input mt-1 w-full"
              />
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Stato
              </span>
              <select
                name="status"
                defaultValue={contratto?.status ?? "prova"}
                className="input mt-1 w-full"
              >
                {STATI_CONTRATTO.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Con cosa paga
              </span>
              <select
                name="provider"
                defaultValue={contratto?.provider ?? "manuale"}
                className="input mt-1 w-full"
              >
                <option value="manuale">Bonifico, a mano</option>
                <option value="stripe">Stripe</option>
                <option value="paypal">PayPal</option>
              </select>
            </label>

            <label className="text-sm sm:col-span-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Note del contratto
              </span>
              <input
                name="notes"
                defaultValue={contratto?.notes ?? ""}
                placeholder="Prezzo fondatori bloccato, sconto concordato, ..."
                className="input mt-1 w-full"
              />
            </label>

            <p className="text-xs sm:col-span-2" style={{ color: "var(--muted)" }}>
              Passare lo stato ad <em>Attivo</em> e&apos; la firma: da li&apos;
              parte la prima scadenza da fatturare. Il canone scritto qui vince
              sempre sul listino — un prezzo concordato resta quello anche se il
              listino cambia.
              {contratto?.status === "prova" && contratto.trialEndsAt && (
                <> La prova finisce il {dataBreve(contratto.trialEndsAt)}.</>
              )}
              {contratto?.nextInvoiceAt && (
                <> Prossima scadenza: {dataBreve(contratto.nextInvoiceAt)}.</>
              )}
            </p>

            <div className="sm:col-span-2">
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                Salva contratto
              </button>
            </div>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Prova gratuita
          </h2>
          <form action={impostaProvaAction} className="card flex flex-wrap items-end gap-3 p-4">
            <input type="hidden" name="id" value={t.id} />
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Giorni da oggi
              </span>
              <input
                name="giorni"
                type="number"
                min={1}
                max={365}
                defaultValue={impostazioni.trialDays}
                className="input mt-1 w-28"
              />
            </label>
            <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
              {contratto?.status === "prova" ? "Allunga la prova" : "Rimetti in prova"}
            </button>
            <p className="w-full text-xs" style={{ color: "var(--muted)" }}>
              {contratto?.status === "prova" && contratto.trialEndsAt
                ? `Adesso finisce il ${dataBreve(contratto.trialEndsAt)}. Si riparte a contare da oggi, non da quella data.`
                : "Rimette il contratto in prova e toglie la prossima scadenza da fatturare."}
              {" "}Il valore di partenza per i locali nuovi si cambia in{" "}
              <a
                href="/admin/fatturazione/listino"
                className="hover:underline"
                style={{ color: "var(--brand-text)" }}
              >
                listino e regole
              </a>
              .
            </p>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Servizio
          </h2>
          <div className="card p-4">
            {t.serviceBlocked ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-danger">
                    {spiegaBlocco(t.blockedReason)}
                  </span>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>
                    Ordinazione al tavolo e pannello di lavoro sono fermi.
                  </span>
                </div>
                <form action={sbloccaAction} className="mt-3">
                  <input type="hidden" name="id" value={t.id} />
                  <button className="btn btn-primary btn-sm">Riaccendi il servizio</button>
                </form>
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Riaccendere non incassa niente: le fatture restano da saldare.
                  Serve per chi dice che il bonifico e&apos; partito e gli credo.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm">Servizio attivo.</p>
                <form action={bloccaAction} className="mt-3">
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    className="btn btn-sm"
                    style={{ border: "1px solid var(--border)", color: "var(--danger)" }}
                  >
                    Spegni per morosita&apos;
                  </button>
                </form>
                <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  Spegne subito senza aspettare la tolleranza. Il titolare
                  continua a entrare e a vedere cosa deve: sono i clienti al
                  tavolo a non poter piu&apos; ordinare.
                </p>
              </>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Dati per la fattura
          </h2>

          {mancanzeFattura.length > 0 && (
            <div
              className="mb-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
            >
              <strong>Non gli si puo&apos; ancora fatturare:</strong> manca{" "}
              {mancanzeFattura.join(", ")}. Ragione sociale, indirizzo e
              provincia stanno in <em>Anagrafica</em> qui sopra; la partita IVA
              qui sotto.
            </div>
          )}
          {mancanzeFattura.length === 0 && avvisiFattura.length > 0 && (
            <div
              className="mb-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--muted)" }}
            >
              La fattura si emette, ma manca {avvisiFattura.join(", ")}.
            </div>
          )}

          <form action={saveDatiFiscali} className="card grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Partita IVA
              </span>
              <input name="vatNumber" defaultValue={t.vatNumber ?? ""} className="input mt-1 w-full" />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Codice fiscale
              </span>
              <input name="taxCode" defaultValue={t.taxCode ?? ""} className="input mt-1 w-full" />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Codice destinatario SDI
              </span>
              <input
                name="sdiCode"
                defaultValue={t.sdiCode ?? ""}
                maxLength={7}
                placeholder="7 caratteri"
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                PEC
              </span>
              <input name="pecEmail" defaultValue={t.pecEmail ?? ""} className="input mt-1 w-full" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Dove mandare i documenti
              </span>
              <input
                name="billingEmail"
                defaultValue={t.billingEmail ?? ""}
                placeholder={t.contactEmail ?? "amministrazione@..."}
                className="input mt-1 w-full"
              />
            </label>
            <p className="text-xs sm:col-span-2" style={{ color: "var(--muted)" }}>
              Ragione sociale e indirizzo si prendono dall&apos;anagrafica qui
              sopra. Codice destinatario e PEC sono alternativi: allo SDI ne
              basta uno, ma tanto vale segnarli tutti e due quando ce li danno.
            </p>
            <div className="sm:col-span-2">
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                Salva dati fattura
              </button>
            </div>
          </form>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Documenti del locale
          </h2>

          {erroreFile && (
            <div
              className="mb-3 rounded-xl px-4 py-3 text-sm"
              style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
            >
              {erroreFile}
            </div>
          )}

          <div className="card overflow-hidden">
            {file.length === 0 && (
              <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
                Nessun documento caricato.
              </p>
            )}
            {file.map((f, i) => (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
              >
                <div className="min-w-[180px] flex-1">
                  <a
                    href={`/api/documenti/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                    style={{ color: "var(--brand-text)" }}
                  >
                    {f.title}
                  </a>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    {etichettaTipoFile(f.kind)} · {pesoLeggibile(f.sizeBytes)} ·{" "}
                    {dataBreve(f.uploadedAt)}
                    {f.notes && ` · ${f.notes}`}
                  </div>
                </div>
                <span className={`badge ${f.visibleToTenant ? "badge-brand" : "badge-muted"}`}>
                  {f.visibleToTenant ? "lo vede il locale" : "solo io"}
                </span>
                <form action={eliminaFileAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="fileId" value={f.id} />
                  <button
                    className="text-xs hover:underline"
                    style={{ color: "var(--danger)" }}
                  >
                    Elimina
                  </button>
                </form>
              </div>
            ))}
          </div>

          <form
            action={caricaFileAction}
            encType="multipart/form-data"
            className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={t.id} />
            <label className="text-sm sm:col-span-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                File
              </span>
              <input
                type="file"
                name="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                required
                className="mt-1 block w-full text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Tipo
              </span>
              <select name="kind" defaultValue="contratto" className="input mt-1 w-full">
                {TIPI_FILE.map((tf) => (
                  <option key={tf.key} value={tf.key}>
                    {tf.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Come si chiama
              </span>
              <input
                name="title"
                placeholder="Contratto firmato 2026"
                className="input mt-1 w-full"
              />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Nota
              </span>
              <input
                name="notes"
                placeholder="Firmato in sede, copia originale da me"
                className="input mt-1 w-full"
              />
            </label>
            <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
              <input
                type="checkbox"
                name="visibleToTenant"
                defaultChecked
                className="mt-px"
              />
              <span>
                <span className="font-medium">Il locale lo vede</span>
                <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                  Compare nella sua pagina Abbonamento. Il contratto si&apos;: e&apos;
                  suo, e fargliela chiedere per mail ogni volta e&apos; lavoro per
                  tutti e due. Gli appunti miei no.
                </span>
              </span>
            </label>
            <div className="sm:col-span-2">
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                Carica
              </button>
              <span className="ml-3 text-xs" style={{ color: "var(--muted)" }}>
                PDF, immagini o Word, fino a 15 MB.
              </span>
            </div>
          </form>
        </section>


        {documenti.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
              Documenti
            </h2>
            <div className="card overflow-hidden">
              {documenti.map((d, i) => (
                <a
                  key={d.id}
                  href={`/admin/fatturazione/${d.id}`}
                  className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-[var(--surface-2)]"
                  style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
                >
                  <span className="tnum w-20 shrink-0" style={{ color: "var(--muted)" }}>
                    {numeroDocumento(d)}
                  </span>
                  <span className={`badge ${badgeDocumento(d.status)}`}>
                    {etichettaDocumento(d.status)}
                  </span>
                  <span className="tnum ml-auto font-medium">
                    {formatPrice(d.totalCents)}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Servizio
          </h2>
          <form action={saveService} className="card grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />
            <div>
              <div className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
                Coperto a persona
              </div>
              <input
                name="coverCharge"
                defaultValue={
                  t.coverChargeCents ? (t.coverChargeCents / 100).toFixed(2).replace(".", ",") : ""
                }
                placeholder="2,00"
                className={input + " w-full"}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                In euro. Lascia vuoto se il locale non lo applica. Viene
                addebitato a ogni persona seduta al tavolo.
              </p>
            </div>
            <div>
              <div className="mb-1 text-xs" style={{ color: "var(--muted)" }}>
                Durata sessione tavolo (minuti)
              </div>
              <input
                name="tableSessionMinutes"
                type="number"
                min="15"
                max="1440"
                defaultValue={t.tableSessionMinutes}
                className={input + " w-full"}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Scaduta, il cliente deve riscansionare il QR.
              </p>
            </div>
            <button className="btn btn-sm sm:col-span-2 sm:justify-self-start">
              Salva servizio
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Aspetto</h2>
          <form
            action={saveBranding}
            className="card grid gap-3 p-4 sm:grid-cols-2"
          >
            <input type="hidden" name="id" value={t.id} />
            <div>
              <div className="mb-1 text-xs text-neutral-500">Preset di tema</div>
              <select name="themePreset" defaultValue={t.themePreset} className={input + " w-full"}>
                {THEME_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">Skin del menu</div>
              <select
                name="menuSkin"
                defaultValue={t.menuSkin}
                className={input + " w-full"}
              >
                {SKIN_CATALOGO.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-neutral-400">
                Cambia solo l&apos;aspetto della pagina cliente, non come funziona.
              </p>
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  name="menuBranding"
                  defaultChecked={t.menuBranding}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm">Firma in fondo al menu</span>
                  <span className="block text-xs text-neutral-400">
                    La riga &quot;Menu con Comanda&quot; sotto l&apos;ultima
                    categoria, che porta alla vetrina. Si toglie a chi non la
                    vuole.
                  </span>
                </span>
              </label>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">Tema di default</div>
              <select
                name="defaultTheme"
                defaultValue={t.defaultTheme}
                className={input + " w-full"}
              >
                <option value="dark">Scuro</option>
                <option value="light">Chiaro</option>
                <option value="system">Come il telefono</option>
              </select>
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">
                Colore brand (tema chiaro)
              </div>
              <input
                name="brandColor"
                defaultValue={t.brandColor ?? ""}
                placeholder="#c9a227"
                className={input + " w-full"}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">
                Colore brand (tema scuro)
              </div>
              <input
                name="brandAccent"
                defaultValue={t.brandAccent ?? ""}
                placeholder="derivato se vuoto"
                className={input + " w-full"}
              />
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">
                Logo {t.logoUrl && "(ne è già presente uno)"}
              </div>
              <input
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="w-full text-xs"
              />
            </div>
            <button className="rounded-lg border border-neutral-200 px-3 py-2 text-sm hover:bg-neutral-50 sm:col-span-2 sm:justify-self-start">
              Salva aspetto
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>Gestione</h2>
          <div className="card space-y-4 p-4">
            <IndirizzoWebLocale
              id={t.id}
              slug={t.slug}
              rootDomain={root}
              action={cambiaIndirizzoWeb}
            />
            <form action={toggleSuspend}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn btn-sm">
                {t.suspended ? "Riattiva locale" : "Sospendi locale"}
              </button>
            </form>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-red-600">Zona pericolosa</h2>
          <div className="card p-4">
            <p className="text-sm text-neutral-500">
              Elimina definitivamente questo locale e tutti i suoi dati.
            </p>
            <div className="mt-3">
              <DeleteLocaleButton id={t.id} name={t.name} deleteAction={deleteLocale} />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
