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
import { getPacchetti, getPrezziModuli, haPrezziSuoi } from "@/lib/billing/prezzi";
import { getSuMisura } from "@/lib/billing/sumisura";
import {
  etichettaPeriodo,
  getContratto,
  importoAScadenzaCents,
} from "@/lib/billing/contratti";
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
  badgeContratto,
  badgeDocumento,
  dataBreve,
  etichettaContratto,
  etichettaDocumento,
  etichettaModello,
} from "@/lib/billing/stati";
import DeleteLocaleButton from "@/components/DeleteLocaleButton";
import FormContratto from "@/components/FormContratto";
import AccessiLocale from "@/components/AccessiLocale";
import IndirizzoWebLocale from "@/components/IndirizzoWebLocale";
import {
  saveAnagrafica,
  cambiaIndirizzoWeb,
  toggleSuspend,
  deleteLocale,
  saveBranding,
  saveService,
  toggleDueFattori,
  resettaAccesso,
  azzeraAccessoDueFattori,
  saveContratto,
  saveDatiFiscali,
  cambiaStatoAttivazioneAction,
  impostaProvaAction,
  salvaPrezziLocaleAction,
  salvaSuMisuraAction,
  eliminaSuMisuraAction,
  azzeraPrezziLocaleAction,
  sbloccaAction,
  bloccaAction,
  caricaFileAction,
  eliminaFileAction,
} from "./actions";

// 4900 -> "49,00", per riempire una casella che si scrive in euro.
function inEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

// Scorciatoia per la classe dei campi: usata dove il markup ripete
// className={input} decine di volte.
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
  // I prezzi che valgono per questo locale: i suoi se ce li ha, il listino se no.
  const prezziModuli = await getPrezziModuli(id);
  const pacchetti = await getPacchetti(id);
  const impostazioni = await getImpostazioni();
  // I moduli gia' dentro il pacchetto firmato. Sono compresi nel canone e non
  // si fatturano a parte: farli pagare due volte e' il tipo di errore che il
  // cliente scopre prima di me.
  const inPacco = new Set(
    pacchetti.find((p) => p.key === contratto?.pack)?.moduli ?? []
  );
  // Il pacchetto da proporre a chi non ha ancora un contratto: il primo del
  // listino, che e' anche il piu' piccolo.
  const paccoProposto = pacchetti[0];

  const haSuoi = await haPrezziSuoi(id);
  const suMisura = await getSuMisura(id);
  const file = await fileDelLocale(id);
  // Quello che gli ho emesso e non risulta ancora saldato. Non tiene conto
  // degli acconti parziali: e' un riepilogo, e per il dettaglio si apre il
  // documento.
  const nonSaldate = documenti.filter(
    (d) => d.status === "emesso" || d.status === "scaduto"
  );
  const daIncassare = nonSaldate.reduce((s, d) => s + d.totalCents, 0);
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

        {/* Le prime tre cose che voglio sapere aprendo un cliente: se paga,
            quanto, e se c'e' qualcosa che non va. Le sei statistiche qui sopra
            raccontano gli ordini, che e' un'altra domanda. */}
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="min-w-[150px]">
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Rapporto
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {/* Senza contratto non e' "in prova": e' un locale a cui non
                    ho ancora chiesto niente. Dirlo "In prova" e poi scrivere
                    "Nessun contratto" due righe sotto e' un pannello che si
                    contraddice da solo. */}
                {contratto ? (
                  <span className={`badge ${badgeContratto(contratto.status)}`}>
                    {etichettaContratto(contratto.status)}
                  </span>
                ) : (
                  <span className="badge badge-muted">Nessun contratto</span>
                )}
                {t.serviceBlocked && (
                  <span className="badge badge-danger">
                    {spiegaBlocco(t.blockedReason)}
                  </span>
                )}
                {/* Cosa manca si legge, non si scopre col mouse fermo sopra:
                    su un telefono quel `title` non esiste proprio. */}
                {mancanzeFattura.length > 0 && (
                  <span className="badge badge-warn">
                    manca {mancanzeFattura.join(", ")}
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {contratto
                  ? `${etichettaModello(contratto.model)} · ${contratto.pack}`
                  : "Da aprire qui sotto"}
              </div>
            </div>

            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Paga
              </div>
              <div className="tnum mt-1 text-lg font-semibold">
                {/* Zero euro sarebbe una cifra, e non e' una cifra: e' che non
                    gli si e' ancora chiesto niente. */}
                {contratto
                  ? formatPrice(importoAScadenzaCents(contratto, totaleAddons))
                  : "—"}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {contratto ? etichettaPeriodo(contratto) : "niente da fatturare"}
                {totaleAddons > 0 && " · add-on inclusi"}
              </div>
            </div>

            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {contratto?.status === "prova" ? "Prova fino al" : "Prossima scadenza"}
              </div>
              {/* Attivo senza scadenza vuol dire che non entra nel giro dei
                  rinnovi: non produce bozze e non si fattura piu'. Un trattino
                  muto lo nasconderebbe finche' non mancano i soldi. */}
              {contratto?.status === "attivo" && !contratto.nextInvoiceAt && (
                <span className="badge badge-danger mt-1 block w-fit">
                  non verra&apos; fatturato
                </span>
              )}
              <div className="tnum mt-1 text-lg font-semibold">
                {dataBreve(
                  contratto?.status === "prova"
                    ? contratto.trialEndsAt
                    : (contratto?.nextInvoiceAt ?? null)
                )}
              </div>
            </div>

            <div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Da incassare
              </div>
              <div
                className="tnum mt-1 text-lg font-semibold"
                style={daIncassare > 0 ? { color: "var(--danger)" } : undefined}
              >
                {formatPrice(daIncassare)}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {daIncassare > 0
                  ? `${nonSaldate.length} document${nonSaldate.length === 1 ? "o" : "i"}`
                  : "tutto saldato"}
              </div>
            </div>
          </div>
        </div>

        <details className="disclosure" open>
          <summary>Anagrafica e dati per la fattura</summary>
          <div className="disclosure-body space-y-8">
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
                placeholder="Come sei registrato, non l'insegna"
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
          </div>
        </details>

        <details className="disclosure" open>
          <summary>Contratto e stato del rapporto</summary>
          <div className="disclosure-body space-y-8">
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
          <FormContratto
            tenantId={t.id}
            pacchetti={pacchetti.map((p) => ({
              key: p.key,
              label: `${p.label} — ${formatPrice(p.mensileCents)}/mese`,
              mensileCents: p.mensileCents,
              annualeCents: p.annualeCents,
              attivazioneCents: p.attivazioneCents,
              assistenzaCents: p.assistenzaCents,
            }))}
            valori={{
              model: contratto?.model ?? "abbonamento",
              pack: contratto?.pack ?? paccoProposto.key,
              period: contratto?.period ?? "mensile",
              // Senza contratto i campi partono dal listino del pacchetto
              // proposto, non da zero: mostrare "Sala" accanto a 0,00 e' una
              // schermata che si contraddice, e chi la legge non sa se il
              // prezzo e' quello o se deve scriverlo lui.
              recurringCents: contratto?.recurringCents ?? paccoProposto.mensileCents,
              activationCents: contratto?.activationCents ?? 0,
              transactionBps: contratto?.transactionBps ?? impostazioni.transactionBps,
              status: contratto?.status ?? "prova",
              provider: contratto?.provider ?? "manuale",
              notes: contratto?.notes ?? "",
            }}
            salva={saveContratto}
            nota={
              <>
                {" "}Passare lo stato ad <em>Attivo</em> e&apos; la firma: da li&apos;
                parte la prima scadenza da fatturare.
                {contratto?.status === "prova" && contratto.trialEndsAt && (
                  <> La prova finisce il {dataBreve(contratto.trialEndsAt)}.</>
                )}
                {contratto?.nextInvoiceAt && (
                  <> Prossima scadenza: {dataBreve(contratto.nextInvoiceAt)}.</>
                )}
                {/* La disdetta va detta qui e non lasciata scoprire dal
                    silenzio di un rinnovo che non arriva: fra il giorno in cui
                    disdice e il giorno in cui se ne va c'e' l'unica finestra
                    per richiamarlo, e puo' durare un anno. */}
                {/* Lo stato dell'attivazione, quando ce n'e' una. Quel campo
                    decideva in silenzio: acceso, l'attivazione non compare
                    piu' ne' in Checkout ne' al rinnovo, e dal pannello non si
                    capiva perche' un impianto non venisse mai chiesto. */}
                {(contratto?.activationCents ?? 0) > 0 && (
                  <>
                    {" "}
                    {contratto?.activationInvoicedAt ? (
                      <>
                        L&apos;attivazione risulta <strong>gia&apos; fatturata</strong> il{" "}
                        {dataBreve(contratto.activationInvoicedAt)}, quindi non
                        viene piu&apos; chiesta.
                      </>
                    ) : (
                      <>
                        L&apos;attivazione e&apos; <strong>ancora da fatturare</strong>:
                        entra nel prossimo documento e nel primo pagamento con
                        carta.
                      </>
                    )}
                  </>
                )}
                {contratto?.providerCancelAt && (
                  <>
                    {" "}
                    <strong style={{ color: "var(--warn)" }}>
                      Ha disdetto: l&apos;abbonamento finisce il{" "}
                      {dataBreve(contratto.providerCancelAt)}.
                    </strong>{" "}
                    Fino ad allora paga e usa tutto. Se non lo si richiama, dopo
                    quella data il contratto va chiuso a mano.
                  </>
                )}
              </>
            }
          />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Pacchetto su misura
          </h2>

          <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
            Quando nessuno dei tre standard va bene. Una volta salvato compare
            accanto a Base, Pro e Premium nella <strong>sua</strong> pagina
            Abbonamento, e ci resta: se passa a uno standard e poi ci ripensa,
            puo&apos; tornarci da solo senza richiamarti.
            {suMisura && contratto?.pack === "su_misura" && (
              <> Adesso e&apos; il pacchetto che ha in corso.</>
            )}
          </p>

          <form action={salvaSuMisuraAction} className="card grid gap-3 p-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={t.id} />

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Come si chiama
              </span>
              <input
                name="sm_label"
                defaultValue={suMisura?.label ?? ""}
                placeholder="Il tuo piano"
                className="input mt-1 w-full"
              />
            </label>

            <label className="text-sm">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Una riga di spiegazione
              </span>
              <input
                name="sm_descrizione"
                defaultValue={suMisura?.descrizione ?? ""}
                placeholder="Pro senza asporto, con la consegna"
                className="input mt-1 w-full"
              />
            </label>

            <div className="sm:col-span-2">
              <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
                Cosa comprende il canone
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {MODULES.filter((m) => !m.comingSoon).map((m) => (
                  <label key={m.key} className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name={`sm_${m.key}`}
                      defaultChecked={suMisura?.moduli.includes(m.key) ?? false}
                    />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {[
              ["mensile", "Mensile (€)", suMisura?.mensileCents ?? 0],
              ["annuale", "Annuale (€)", suMisura?.annualeCents ?? 0],
              ["attivazione", "Installazione (€)", suMisura?.attivazioneCents ?? 0],
              ["assistenza", "Assistenza al mese (€)", suMisura?.assistenzaCents ?? 0],
            ].map(([k, etichetta, valore]) => (
              <label key={String(k)} className="text-sm">
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {etichetta}
                </span>
                <input
                  name={`sm_${k}`}
                  defaultValue={inEuro(Number(valore))}
                  inputMode="decimal"
                  className="input mt-1 w-full"
                />
              </label>
            ))}

            <div className="sm:col-span-2">
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                {suMisura ? "Salva il su misura" : "Crea il su misura"}
              </button>
            </div>
          </form>

          {suMisura && contratto?.pack !== "su_misura" && (
            <form action={eliminaSuMisuraAction} className="mt-2">
              <input type="hidden" name="id" value={t.id} />
              <button
                className="btn btn-sm"
                style={{ border: "1px solid var(--border)", color: "var(--danger)" }}
              >
                Togli il su misura
              </button>
              <span className="ml-3 text-xs" style={{ color: "var(--muted)" }}>
                Da fare solo quando l&apos;accordo e&apos; finito: da li&apos; in
                poi non puo&apos; piu&apos; tornarci.
              </span>
            </form>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              Prezzi per questo locale
            </h2>
            <a
              href="/admin/fatturazione/listino"
              className="text-xs hover:underline"
              style={{ color: "var(--brand-text)" }}
            >
              Listino di tutti →
            </a>
          </div>

          <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
            Sono i prezzi che vede <strong>lui</strong> quando sceglie il piano
            dalla sua dashboard. Partono dal listino: quello che cambi qui vale
            solo per questo locale, e resta anche se il listino di tutti cambia.
            {haSuoi && (
              <> Oggi ha almeno un prezzo suo, diverso dal listino.</>
            )}
          </p>

          <form action={salvaPrezziLocaleAction} className="space-y-3">
            <input type="hidden" name="id" value={t.id} />

            {pacchetti.map((p) => (
              <div key={p.key} className="card p-4">
                <div className="mb-3 text-sm font-medium">{p.label}</div>
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ["mensile", "Mensile", p.mensileCents],
                    ["annuale", "Annuale", p.annualeCents],
                    ["attivazione", "Installazione", p.attivazioneCents],
                    ["assistenza", "Assistenza", p.assistenzaCents],
                  ].map(([k, etichetta, valore]) => (
                    <label key={String(k)} className="text-sm">
                      <span className="text-xs" style={{ color: "var(--muted)" }}>
                        {etichetta}
                      </span>
                      <input
                        name={`p_${p.key}_${k}`}
                        defaultValue={inEuro(Number(valore))}
                        inputMode="decimal"
                        className="input mt-1 w-full"
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="card p-0">
              {MODULES.filter((m) => prezziModuli[m.key] > 0).map((m, i) => (
                <div
                  key={m.key}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                  style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
                >
                  <span className="min-w-[180px] flex-1 text-sm">{m.label}</span>
                  <input
                    name={`m_${m.key}`}
                    defaultValue={inEuro(prezziModuli[m.key])}
                    inputMode="decimal"
                    className="input w-24 text-right"
                  />
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    al mese
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                Salva i prezzi di questo locale
              </button>
            </div>
          </form>

          {haSuoi && (
            <form action={azzeraPrezziLocaleAction} className="mt-2">
              <input type="hidden" name="id" value={t.id} />
              <button
                className="btn btn-sm"
                style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
              >
                Rimettilo sul listino di tutti
              </button>
            </form>
          )}
        </section>

        {(contratto?.activationCents ?? 0) > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
              Attivazione
            </h2>
            <form
              action={cambiaStatoAttivazioneAction}
              className="card flex flex-wrap items-center gap-3 p-4"
            >
              <input type="hidden" name="id" value={t.id} />
              <input
                type="hidden"
                name="verso"
                value={contratto?.activationInvoicedAt ? "da_fatturare" : "fatturata"}
              />
              <span className="flex-1 text-sm">
                <strong className="tnum">{formatPrice(contratto!.activationCents)}</strong>{" "}
                {contratto?.activationInvoicedAt ? (
                  <>
                    gia&apos; fatturata il {dataBreve(contratto.activationInvoicedAt)}:
                    non viene piu&apos; chiesta, ne&apos; in fattura ne&apos; con la carta.
                  </>
                ) : (
                  <>
                    da fatturare: entra nel prossimo documento e nel primo
                    pagamento con carta.
                  </>
                )}
              </span>
              <button className="btn btn-sm" style={{ border: "1px solid var(--border)" }}>
                {contratto?.activationInvoicedAt
                  ? "Rimettila da fatturare"
                  : "Segnala come gia' fatturata"}
              </button>
            </form>
          </section>
        )}

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
            Stato del servizio
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
          </div>
        </details>

        <details className="disclosure">
          <summary>Fatture e documenti</summary>
          <div className="disclosure-body space-y-8">
        {documenti.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
              Fatture emesse
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
            Contratti e allegati
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
          </div>
        </details>

        <details className="disclosure">
          <summary>Configurazione del locale</summary>
          <div className="disclosure-body space-y-8">
        <section>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Moduli
          </h2>
          {/* Sola lettura, ed e' il punto: i moduli li decide il pacchetto.
              Erano spuntabili a mano, e cosi' erano due decisioni separate
              sulla stessa cosa — che pacchetto ha firmato, e cosa gli e'
              acceso — che prima o poi si contraddicono. Vedere cosa ha serve
              ancora; cambiarlo da qui no: si cambia il pacchetto, o se ne
              compone uno su misura. */}
          <div className="card p-4">
            <div className="space-y-1">
              {MODULES.filter((m) => modules[m.key] || inPacco.has(m.key)).map((m) => {
                const compreso = inPacco.has(m.key);
                const attivo = addons.find((a) => a.moduleKey === m.key);
                return (
                  <div
                    key={m.key}
                    className="flex flex-wrap items-start gap-3 rounded-lg px-2 py-1.5"
                  >
                    <span className="min-w-[220px] flex-1 text-sm">
                      <span className="font-medium">{m.label}</span>
                      {compreso ? (
                        <span className="ml-2 badge badge-muted">nel pacchetto</span>
                      ) : attivo ? (
                        <span className="ml-2 badge badge-warn">concordato a parte</span>
                      ) : (
                        <span className="ml-2 badge badge-warn">fuori pacchetto</span>
                      )}
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {m.description}
                      </span>
                    </span>
                    <span
                      className="tnum w-[152px] shrink-0 pt-0.5 text-right text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      {compreso
                        ? "nel canone"
                        : attivo
                          ? `${formatPrice(attivo.priceCents)} al mese`
                          : "acceso e non pagato"}
                    </span>
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
                {totaleAddons > 0 && <> + concordati {formatPrice(totaleAddons)}</>}{" "}
                ={" "}
                <strong style={{ color: "var(--fg)" }}>
                  {formatPrice((contratto?.recurringCents ?? 0) + totaleAddons)}
                </strong>{" "}
                {contratto ? etichettaPeriodo(contratto) : ""}
              </span>
            </div>

            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              Si accendono e si spengono col pacchetto: cambiando piano qui
              sopra, i moduli seguono da soli. Se ne serve uno che a listino
              non c&apos;e&apos;, il modo e&apos; comporre un{" "}
              <strong>pacchetto su misura</strong> qui sotto — dandogli il suo
              prezzo si accende nel locale.
            </p>
          </div>
        </section>
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
          </div>
        </details>

        <details className="disclosure">
          <summary>Accessi e gestione</summary>
          <div className="disclosure-body space-y-8">
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
          </div>
        </details>
      </main>
    </div>
  );
}
