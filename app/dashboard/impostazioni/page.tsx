import { redirect } from "next/navigation";
import { and, asc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuCategories,
  printJobs,
  reparti,
  tenants,
  users,
} from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getTenantModules } from "@/lib/modules";
import Select from "@/components/Select";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import PostazioneStampa from "@/components/PostazioneStampa";
import EditorOrari from "@/components/OrariApertura";
import { leggiChiusure, leggiOrari } from "@/lib/orari";
import ChiusureLocale from "@/components/ChiusureLocale";
import Field from "@/components/Field";
import ProvaPosta from "@/components/ProvaPosta";
import SuoneriaChiamate from "@/components/SuoneriaChiamate";
import { leggiImpostazioni } from "@/lib/prenotazioni";
import { cifraturaDisponibile } from "@/lib/segreti";
import {
  addReparto,
  deleteReparto,
  provaPosta,
  salvaChiamate,
  salvaChiusure,
  salvaOrari,
  salvaPosta,
  salvaPrenotazioni,
  salvaStampa,
  setCategoriaReparto,
  setUtenteReparto,
} from "./actions";

function Interruttore({
  nome,
  etichetta,
  descrizione,
  acceso,
}: {
  nome: string;
  etichetta: string;
  descrizione: string;
  acceso: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2.5">
      <input
        type="checkbox"
        name={nome}
        defaultChecked={acceso}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{etichetta}</span>
        <span className="block text-xs" style={{ color: "var(--muted)" }}>
          {descrizione}
        </span>
      </span>
    </label>
  );
}

export default async function ImpostazioniPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/dashboard");

  const [locale] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (!locale) redirect("/login");

  const modules = await getTenantModules(session.tenantId);
  const cfg = leggiImpostazioni(locale);
  const segretiPronti = cifraturaDisponibile();
  // L'indirizzo pubblico si mostra per intero: e' quello che il locale
  // incolla su Google e sui social, e va letto senza doverlo ricostruire.
  const indirizzoPubblico = `${session.tenantSlug}.${
    process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"
  }/prenota`;

  const [elencoReparti, categorie, staff] = await Promise.all([
    db
      .select({ id: reparti.id, name: reparti.name })
      .from(reparti)
      .where(eq(reparti.tenantId, session.tenantId))
      .orderBy(asc(reparti.sortOrder), asc(reparti.name)),
    db
      .select({
        id: menuCategories.id,
        name: menuCategories.name,
        repartoId: menuCategories.repartoId,
      })
      .from(menuCategories)
      .where(eq(menuCategories.tenantId, session.tenantId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name)),
    db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        repartoId: users.repartoId,
      })
      .from(users)
      .where(eq(users.tenantId, session.tenantId))
      .orderBy(asc(users.email)),
  ]);

  // Comande create e mai stampate da piu' di due minuti: vuol dire che nessun
  // dispositivo sta servendo quel reparto. Senza questo avviso la coda si
  // riempie in silenzio e il locale se ne accorge dai clienti che aspettano.
  const dueMinutiFa = new Date(Date.now() - 2 * 60 * 1000);
  const arretrati = await db
    .select({ id: printJobs.id })
    .from(printJobs)
    .where(
      and(
        eq(printJobs.tenantId, session.tenantId),
        isNull(printJobs.printedAt),
        lt(printJobs.createdAt, dueMinutiFa)
      )
    );

  const opzioniReparto = [
    { value: "", label: "Coda generale" },
    ...elencoReparti.map((r) => ({ value: r.id, label: r.name })),
  ];

  // Le comande stampabili sono quelle dei canali che il locale ha davvero:
  // un'opzione per l'asporto in un locale senza asporto e' solo confusione.
  const canaliStampabili = [
    {
      nome: "tavolo",
      etichetta: "Comande dai tavoli",
      descrizione: "Ogni ordine inviato dal QR o dal cameriere.",
      acceso: locale.printComandaTavolo,
      attivo: modules.qr_ordering,
    },
    {
      nome: "banco",
      etichetta: "Comande dal banco",
      descrizione: "Quello che si batte in cassa al bancone.",
      acceso: locale.printComandaBanco,
      attivo: modules.counter_orders,
    },
    {
      nome: "asporto",
      etichetta: "Comande d'asporto",
      descrizione: "Con il nome di chi ritira e l'ora concordata.",
      acceso: locale.printComandaAsporto,
      attivo: modules.takeaway,
    },
    {
      nome: "domicilio",
      etichetta: "Comande a domicilio",
      descrizione: "Con indirizzo e telefono per chi consegna.",
      acceso: locale.printComandaDomicilio,
      attivo: modules.delivery,
    },
  ].filter((c) => c.attivo);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Impostazioni</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Reparti di preparazione e stampa delle comande.
        </p>
      </div>

      {/* --- Reparti --- */}
      <section className="card p-4">
        <div className="text-sm font-medium">Reparti</div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Le postazioni che preparano: cucina, pizzeria, bar. Senza reparti
          tutto resta in un&apos;unica coda, come adesso.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {elencoReparti.map((r) => (
            <form
              key={r.id}
              action={deleteReparto}
              className="flex items-center gap-1 rounded-full pl-3 pr-1 text-sm"
              style={{ background: "var(--surface-2)" }}
            >
              <input type="hidden" name="id" value={r.id} />
              <span>{r.name}</span>
              <ConfirmSubmit
                label="✕"
                ariaLabel={`Elimina il reparto ${r.name}`}
              />
            </form>
          ))}
          <form action={addReparto} className="flex items-center gap-1">
            <input
              name="name"
              aria-label="Nome del nuovo reparto"
              placeholder="Cucina, Pizzeria…"
              className="h-9 w-40 rounded-full px-3 text-sm"
              style={{
                border: "1px dashed var(--border)",
                background: "transparent",
                color: "var(--text)",
              }}
            />
            <button
              className="h-9 rounded-full px-3 text-sm"
              style={{ color: "var(--brand-text)" }}
            >
              aggiungi
            </button>
          </form>
        </div>
      </section>

      {/* --- Chi prepara cosa --- */}
      {elencoReparti.length > 0 && (
        <section className="card p-4">
          <div className="text-sm font-medium">Chi prepara cosa</div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Ogni categoria del menu va a un reparto. Quelle lasciate sulla coda
            generale restano visibili a tutti: meglio nel posto sbagliato che
            perse.
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {categorie.map((c) => (
              <form
                key={c.id}
                action={setCategoriaReparto}
                className="flex items-center justify-between gap-3 rounded-xl px-3 py-2"
                style={{ background: "var(--surface-2)" }}
              >
                <input type="hidden" name="categoriaId" value={c.id} />
                <span className="min-w-0 truncate text-sm">{c.name}</span>
                <Select
                  size="sm"
                  name="repartoId"
                  className="w-40 shrink-0"
                  defaultValue={c.repartoId ?? ""}
                  options={opzioniReparto}
                  submitOnChange
                />
              </form>
            ))}
          </div>
        </section>
      )}

      {/* --- Account --- */}
      {elencoReparti.length > 0 && (
        <section className="card p-4">
          <div className="text-sm font-medium">Account e reparti</div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Chi ha un reparto vede solo la propria coda. I titolari vedono
            tutto comunque.
          </p>

          <div className="mt-3 space-y-2">
            {staff.map((u) => (
              <form
                key={u.id}
                action={setUtenteReparto}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2"
                style={{ background: "var(--surface-2)" }}
              >
                <input type="hidden" name="userId" value={u.id} />
                <span className="min-w-0 truncate text-sm">
                  {u.email}
                  {u.role === "owner" && (
                    <span className="badge badge-muted ml-2">Titolare</span>
                  )}
                </span>
                <Select
                  size="sm"
                  name="repartoId"
                  className="w-40 shrink-0"
                  defaultValue={u.repartoId ?? ""}
                  options={[
                    { value: "", label: "Nessun reparto" },
                    ...elencoReparti.map((r) => ({
                      value: r.id,
                      label: r.name,
                    })),
                  ]}
                  submitOnChange
                />
              </form>
            ))}
          </div>
        </section>
      )}

      {/* --- Orari --- */}
      {(modules.takeaway || modules.delivery || modules.reservations) && (
        <section className="card p-4">
          <div className="text-sm font-medium">Orari di apertura</div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            {modules.reservations
              ? "Da qui escono le fasce che il cliente vede quando prenota, e quelle di ritiro proposte in cassa. Due intervalli per giorno, se chiudete nel pomeriggio."
              : "Da qui si calcolano le fasce di ritiro e consegna proposte in cassa. Due intervalli per giorno, se chiudete nel pomeriggio."}
          </p>
          <EditorOrari iniziali={leggiOrari(locale.openingHours)} salva={salvaOrari} />

          <div
            className="mt-5 border-t pt-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="text-sm font-medium">Giorni di chiusura</div>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              Feste, ferie, giornate storte. In quei giorni non si prenota e non
              si propone nessun ritiro, anche se in settimana sarebbe aperto.
            </p>
            <ChiusureLocale
              iniziali={leggiChiusure(locale.closureDays)}
              salva={salvaChiusure}
            />
          </div>
        </section>
      )}

      {/* --- Prenotazione online --- */}
      {modules.reservations && (
        <section className="card p-4">
          <div className="text-sm font-medium">Prenotazione online</div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            La pagina pubblica è{" "}
            <a
              href="/prenota"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {indirizzoPubblico}
            </a>
            : è il link da mettere su Google, sui social e sul menu.
          </p>

          <form action={salvaPrenotazioni} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="Tavoli che si possono accostare"
              hint="La sala non è fatta di posti fissi: cinque tavoli da due, accostati, diventano un tavolo da dieci. 1 = i tavoli non si uniscono."
            >
              <input
                type="number"
                name="maxTavoliUniti"
                min={1}
                max={8}
                defaultValue={cfg.maxTavoliUniti}
                className="input tnum"
              />
            </Field>
            <Field
              label="Sedie in più per tavolo"
              hint="Un tavolo da due diventa da tre aggiungendo una sedia. 0 = si sta solo nei posti che ci sono."
            >
              <input
                type="number"
                name="sedieExtra"
                min={0}
                max={6}
                defaultValue={cfg.sedieExtra}
                className="input tnum"
              />
            </Field>

            <Field
              label="Persone: da"
              hint="Sotto questo numero non si prenota online."
            >
              <input
                type="number"
                name="minPersone"
                min={1}
                max={20}
                defaultValue={cfg.minPersone}
                className="input tnum"
              />
            </Field>
            <Field
              label="Persone: fino a"
              hint="I gruppi più grandi vengono mandati a chiamare il locale."
            >
              <input
                type="number"
                name="maxPersone"
                min={1}
                max={50}
                defaultValue={cfg.maxPersone}
                className="input tnum"
              />
            </Field>

            <Field
              label="Durata del tavolo (minuti)"
              hint="Quanto resta occupato. È la cosa che decide quanti turni fate."
            >
              <input
                type="number"
                name="durata"
                min={30}
                max={360}
                step={15}
                defaultValue={cfg.durataMinuti}
                className="input tnum"
              />
            </Field>
            <Field
              label="Passo delle fasce (minuti)"
              hint="Ogni quanto si propone un orario: 30 è il passo con cui la gente ragiona."
            >
              <input
                type="number"
                name="passo"
                min={10}
                max={120}
                step={5}
                defaultValue={cfg.passoMinuti}
                className="input tnum"
              />
            </Field>

            <Field
              label="Preavviso minimo (minuti)"
              hint="Sotto questa soglia non si prenota più per oggi."
            >
              <input
                type="number"
                name="preavviso"
                min={0}
                max={2880}
                step={15}
                defaultValue={cfg.preavvisoMinuti}
                className="input tnum"
              />
            </Field>
            <Field
              label="Quanti giorni in avanti"
              hint="Oltre, il locale non prende impegni."
            >
              <input
                type="number"
                name="giorniAvanti"
                min={1}
                max={365}
                defaultValue={cfg.giorniAvanti}
                className="input tnum"
              />
            </Field>

            <div className="divide-y sm:col-span-2" style={{ borderColor: "var(--border)" }}>
              <Interruttore
                nome="confermaAutomatica"
                etichetta="Conferma e mail automatiche"
                descrizione="Il tavolo è preso appena il cliente invia e la conferma parte da sola. Spenta, ogni prenotazione resta «da confermare»: siete voi ad accettarla, spostarla o rifiutarla — e in tutti e tre i casi al cliente arriva una mail."
                acceso={cfg.confermaAutomatica}
              />
            </div>

            <Field
              label="Riga da mostrare a chi prenota"
              hint="Una regola della casa: «il tavolo si tiene 15 minuti», «cucina fino alle 22:30»."
              className="sm:col-span-2"
            >
              <input
                name="nota"
                maxLength={300}
                defaultValue={cfg.nota ?? ""}
                placeholder="Il tavolo viene tenuto 15 minuti oltre l'orario."
                className="input"
              />
            </Field>

            <button className="btn btn-primary btn-sm sm:col-span-2 sm:justify-self-start">
              Salva le prenotazioni
            </button>
          </form>
        </section>
      )}

      {/* --- Posta del locale --- */}
      {modules.reservations && (
        <section className="card p-4">
          <div className="text-sm font-medium">Posta del locale</div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Le conferme di prenotazione partono da questa casella, con il nome
            del locale e il link per disdire. Serve una{" "}
            <strong>password per applicazione</strong> — si genera dal pannello
            della casella (Gmail, Aruba, Register) e non è la password con cui
            leggete la posta: si revoca da sola, senza toccare l&apos;account.
          </p>

          {!segretiPronti ? (
            <p
              className="mt-3 rounded-xl px-3 py-2.5 text-xs"
              style={{ background: "var(--warn-bg)", color: "var(--warn)" }}
            >
              Manca <code>APP_SECRET</code> nella configurazione del server:
              senza, la password non si può cifrare e qui non si salva.
              Aggiungetela al file <code>.env</code> (una frase lunga a caso) e
              riavviate il servizio.
            </p>
          ) : (
            <>
              <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                {locale.smtpUser ? (
                  <>
                    Configurata:{" "}
                    <span style={{ color: "var(--text)", fontWeight: 600 }}>
                      {locale.smtpUser}
                    </span>
                  </>
                ) : (
                  "Non configurata: per ora nessuna mail parte, e chi prenota deve salvarsi il link."
                )}
              </div>

              <form action={salvaPosta} className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Indirizzo del locale"
                  hint="Svuotalo e salva per spegnere le mail."
                >
                  <input
                    name="user"
                    type="email"
                    maxLength={160}
                    defaultValue={locale.smtpUser ?? ""}
                    placeholder="prenotazioni@illocale.it"
                    autoComplete="off"
                    className="input"
                  />
                </Field>
                <Field
                  label="Password per applicazione"
                  hint={
                    locale.smtpPass
                      ? "Ne è già salvata una: lascia vuoto per tenerla."
                      : "Sedici caratteri generati dal pannello della casella."
                  }
                >
                  <input
                    name="pass"
                    type="password"
                    maxLength={200}
                    placeholder={locale.smtpPass ? "••••••••••••" : ""}
                    autoComplete="new-password"
                    className="input"
                  />
                </Field>
                <Field label="Server di posta">
                  <input
                    name="host"
                    maxLength={120}
                    defaultValue={locale.smtpHost ?? "smtp.gmail.com"}
                    className="input"
                  />
                </Field>
                <Field label="Porta" hint="465 con TLS diretto, 587 con STARTTLS.">
                  <Select
                    name="porta"
                    defaultValue={String(locale.smtpPort)}
                    options={[
                      { value: "465", label: "465" },
                      { value: "587", label: "587" },
                    ]}
                  />
                </Field>
                <button className="btn btn-primary btn-sm sm:col-span-2 sm:justify-self-start">
                  Salva la posta
                </button>
              </form>

              {locale.smtpUser && locale.smtpPass && <ProvaPosta prova={provaPosta} />}
            </>
          )}
        </section>
      )}

      {/* --- Chiamate al tavolo --- */}
      {modules.waiter_call && (
        <section className="card p-4">
          <div className="text-sm font-medium">Chiamate al tavolo</div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Come ve ne accorgete quando un tavolo chiama. Vale per tutti gli
            schermi che hanno la dashboard aperta.
          </p>

          <form action={salvaChiamate} className="mt-3">
            <Field
              label="Suono"
              hint="Si sente scegliendolo. Con la musica alta conviene provarli in sala, non in ufficio."
            >
              <SuoneriaChiamate scelto={locale.callSound} />
            </Field>

            <div
              className="mt-1 divide-y"
              style={{ borderColor: "var(--border)" }}
            >
              <Interruttore
                nome="lampeggia"
                etichetta="Campanella lampeggiante"
                descrizione="Si muove finché la chiamata non è presa: da tre metri il pallino rosso non si vede."
                acceso={locale.callBlink}
              />
            </div>
            <button className="btn btn-primary btn-sm mt-3">Salva</button>
          </form>
        </section>
      )}

      {/* --- Stampa --- */}
      <section className="card p-4">
        <div className="text-sm font-medium">Stampa automatica</div>
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          Le comande escono appena l&apos;ordine arriva, non al pagamento: chi
          prepara deve partire subito.
        </p>

        <form action={salvaStampa} className="mt-2">
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {canaliStampabili.map((c) => (
              <Interruttore
                key={c.nome}
                nome={c.nome}
                etichetta={c.etichetta}
                descrizione={c.descrizione}
                acceso={c.acceso}
              />
            ))}
            {modules.split_bill && (
              <Interruttore
                nome="contoChiusura"
                etichetta="Scontrino del conto alla chiusura"
                descrizione="Oltre a poterlo stampare a mano quando serve."
                acceso={locale.printContoAllaChiusura}
              />
            )}
            {canaliStampabili.some((c) => c.nome !== "tavolo") && (
              <Interruttore
                nome="scontrinoCassa"
                etichetta="Scontrino sugli ordini di cassa"
                descrizione="È il valore di partenza della spunta: alla cassa si decide ordine per ordine."
                acceso={locale.printScontrinoCassa}
              />
            )}
          </div>
          <button className="btn btn-primary btn-sm mt-3">Salva</button>
        </form>
      </section>

      {arretrati.length > 0 && (
        <div
          className="card p-4"
          style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}
        >
          <div className="text-sm font-medium">
            {arretrati.length}{" "}
            {arretrati.length === 1 ? "comanda ferma" : "comande ferme"} in coda
          </div>
          <p className="mt-0.5 text-xs">
            Sono state create ma nessun dispositivo le ha stampate. Controlla
            che almeno un computer abbia selezionato i reparti giusti qui sotto,
            e che quel computer abbia questa pagina aperta.
          </p>
        </div>
      )}

      <PostazioneStampa reparti={elencoReparti} />
    </div>
  );
}
