import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { reservations, restaurantTables, tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { requireModule } from "@/lib/module-guard";
import { problemiDelLocale } from "@/lib/pronto";
import { getTenantModules } from "@/lib/modules";
import ProblemiLocale from "@/components/ProblemiLocale";
import { leggiOrari } from "@/lib/orari";
import {
  BADGE_STATO,
  ETICHETTA_STATO,
  dataISO,
  etichettaTavoli,
  giornoLeggibile,
  isStato,
  leggiImpostazioni,
  postiPrenotabili,
  type StatoPrenotazione,
} from "@/lib/prenotazioni";
import Field from "@/components/Field";
import CampoOra from "@/components/CampoOra";
import Select from "@/components/Select";
import SceltaGiorno from "@/components/SceltaGiorno";
import {
  annullaPrenotazione,
  assegnaTavoli,
  confermaPrenotazione,
  nuovaPrenotazione,
  segnaArrivati,
  segnaAssente,
  spostaPrenotazione,
} from "./actions";

// La giornata delle prenotazioni, un giorno per schermata. Non e' un elenco
// infinito: chi apre questa pagina sta preparando una sera, e vuole vedere chi
// arriva stasera — non chi ha prenotato per il mese prossimo.

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div
      className="stat"
      style={
        accent ? { borderColor: "var(--brand)", background: "var(--brand-50)" } : undefined
      }
    >
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: "var(--brand-text)" } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default async function PrenotazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("reservations");

  const adesso = new Date();
  const oggi = dataISO(adesso);
  const { g } = await searchParams;
  const giorno = g && /^\d{4}-\d{2}-\d{2}$/.test(g) ? g : oggi;
  const inizioGiorno = new Date(`${giorno}T00:00`);
  const fineGiorno = new Date(`${giorno}T00:00`);
  fineGiorno.setDate(fineGiorno.getDate() + 1);

  const [[locale], righe, tavoli] = await Promise.all([
    db
      .select({
        openingHours: tenants.openingHours,
        reservationSlotMinutes: tenants.reservationSlotMinutes,
        reservationDurationMinutes: tenants.reservationDurationMinutes,
        reservationMinParty: tenants.reservationMinParty,
        reservationMaxParty: tenants.reservationMaxParty,
        reservationLeadMinutes: tenants.reservationLeadMinutes,
        reservationHorizonDays: tenants.reservationHorizonDays,
        reservationAutoConfirm: tenants.reservationAutoConfirm,
        reservationMaxJoin: tenants.reservationMaxJoin,
        reservationExtraSeats: tenants.reservationExtraSeats,
        reservationNote: tenants.reservationNote,
      })
      .from(tenants)
      .where(eq(tenants.id, session.tenantId))
      .limit(1),
    db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.tenantId, session.tenantId),
          gte(reservations.startsAt, inizioGiorno),
          lt(reservations.startsAt, fineGiorno)
        )
      )
      .orderBy(asc(reservations.startsAt)),
    db
      .select({
        numero: restaurantTables.number,
        posti: restaurantTables.seats,
        prenotabile: restaurantTables.bookable,
      })
      .from(restaurantTables)
      .where(eq(restaurantTables.tenantId, session.tenantId))
      .orderBy(asc(restaurantTables.number)),
  ]);
  if (!locale) redirect("/login");

  const cfg = leggiImpostazioni(locale);
  const orari = leggiOrari(locale.openingHours);
  const prenotabili = tavoli.filter((t) => t.prenotabile);

  const attive = righe.filter((r) => r.status !== "cancelled" && r.status !== "no_show");
  const coperti = attive.reduce((s, r) => s + r.partySize, 0);
  const daConfermare = righe.filter(
    (r) => r.status === "pending" || r.status === "proposed"
  ).length;

  // La capienza della sala non e' il numero di tavoli: e' quanta gente ci sta
  // dentro, sedie aggiuntive comprese. E' il numero che dice se stasera si
  // puo' ancora prendere qualcuno.
  const postiSala = postiPrenotabili(
    prenotabili.map((t) => ({ numero: t.numero, posti: t.posti })),
    cfg
  );

  const opzioniTavolo = [
    { value: "", label: "Senza tavolo" },
    ...prenotabili.map((t) => ({
      value: String(t.numero),
      label: `Tavolo ${t.numero} · ${t.posti} posti`,
    })),
  ];

  // I guasti che riguardano proprio questa pagina. Stanno anche in home, ma
  // chi lavora le prenotazioni entra qui: e' qui che deve vedere che le mail
  // ai clienti non stanno partendo.
  const suoi = (
    await problemiDelLocale(session.tenantId, await getTenantModules(session.tenantId))
  ).filter((p) =>
    p.chiave.includes("prenotazioni") || p.chiave === "tavoli-prenotabili"
  );

  return (
    <div className="space-y-6">
      <ProblemiLocale problemi={suoi} compatto />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Prenotazioni</h1>
          <p className="mt-0.5 text-sm cap-prima" style={{ color: "var(--muted)" }}>
            {giornoLeggibile(inizioGiorno, adesso)}
          </p>
        </div>
        <SceltaGiorno giorno={giorno} oggi={oggi} base="/dashboard/prenotazioni" />
      </div>

      {(!prenotabili.length || !Object.keys(orari).length) && (
        <div
          className="card p-4 text-sm"
          style={{ borderColor: "var(--warn)", background: "var(--warn-bg)" }}
        >
          <div className="font-medium">Il modulo non può ancora rispondere a nessuno</div>
          <p className="mt-1">
            {!Object.keys(orari).length && (
              <>
                Mancano gli <Link href="/dashboard/impostazioni" className="underline">orari di apertura</Link>:
                senza, non si sa in che fasce si può prenotare.{" "}
              </>
            )}
            {!prenotabili.length && (
              <>
                Nessun tavolo è segnato come prenotabile: si sistema in{" "}
                <Link href="/dashboard/tables" className="underline">Tavoli</Link>, indicando quanti posti ha ognuno.
              </>
            )}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Prenotazioni" value={attive.length} />
        <Stat label="Coperti attesi" value={`${coperti} su ${postiSala}`} />
        <Stat label="Da confermare" value={daConfermare} accent={daConfermare > 0} />
        <Stat
          label="Posti in sala"
          value={`${postiSala} · ${prenotabili.length} tav.`}
        />
      </div>

      <details className="disclosure">
        <summary>Prendi una prenotazione al telefono</summary>
        <div className="disclosure-body">
          <form action={nuovaPrenotazione} className="grid gap-3 sm:grid-cols-2">
            <Field label="Giorno">
              <input type="date" name="giorno" defaultValue={giorno} required className="input" />
            </Field>
            <Field label="Ora">
              <CampoOra name="ora" passo={15} />
            </Field>
            <Field label="Persone">
              <input
                type="number"
                name="persone"
                min={1}
                max={50}
                defaultValue={2}
                required
                className="input"
              />
            </Field>
            <Field label="A nome di">
              <input name="nome" required maxLength={80} placeholder="Rossi" className="input" />
            </Field>
            <Field label="Telefono" hint="Serve solo se il tavolo salta.">
              <input name="telefono" type="tel" maxLength={32} className="input" />
            </Field>
            <Field
              label="Email"
              hint="Se la lascia, gli arriva la conferma con il link per disdire."
            >
              <input name="email" type="email" maxLength={160} className="input" />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <input name="note" maxLength={300} placeholder="Seggiolone, allergie…" className="input" />
            </Field>
            <button className="btn btn-primary sm:col-span-2 sm:justify-self-start">
              Aggiungi la prenotazione
            </button>
          </form>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Il tavolo viene assegnato da solo se ce n&apos;è uno libero. Se la
            sala è piena la prenotazione si salva lo stesso, senza posto: in
            sala sapete voi dove metterli. Prendendola per un altro giorno, la
            trovi spostandoti con le frecce qui sopra.
          </p>
        </div>
      </details>

      {righe.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <div className="text-base font-medium">Nessuna prenotazione</div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Per questo giorno non ha prenotato nessuno.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {righe.map((r) => {
            const stato: StatoPrenotazione = isStato(r.status) ? r.status : "confirmed";
            const ora = r.startsAt.toLocaleTimeString("it-IT", {
              hour: "2-digit",
              minute: "2-digit",
            });
            const chiuso = stato === "cancelled" || stato === "no_show";
            // Un gruppo su due tavoli accostati non e' fra le opzioni: si
            // mostra come scelta corrente, cosi' il menu dice la verita' su
            // dov'e' seduto senza doverlo spezzare.
            const valoreTavoli = r.tableNumbers.join("+");
            const opzioni =
              r.tableNumbers.length > 1
                ? [
                    { value: valoreTavoli, label: etichettaTavoli(r.tableNumbers)! },
                    ...opzioniTavolo,
                  ]
                : opzioniTavolo;

            return (
              <li
                key={r.id}
                className="card p-4"
                style={chiuso ? { opacity: 0.55 } : undefined}
              >
                <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
                  <div className="tnum text-2xl font-semibold leading-none">{ora}</div>

                  <div className="min-w-[10rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.customerName}</span>
                      <span className="badge badge-muted">
                        {r.partySize} {r.partySize === 1 ? "persona" : "persone"}
                      </span>
                      <span className={"badge " + BADGE_STATO[stato]}>
                        {ETICHETTA_STATO[stato]}
                      </span>
                      {r.source === "staff" && (
                        <span className="badge badge-muted">al telefono</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
                      <a href={`tel:${r.customerPhone}`} className="underline">
                        {r.customerPhone}
                      </a>
                      {r.customerEmail && <> · {r.customerEmail}</>}
                      {/* Se l'avviso non e' partito, il cliente non sa niente:
                          e' un dato di servizio, non un dettaglio tecnico. */}
                      {r.customerEmail ? (
                        r.notifiedAt ? (
                          <>
                            {" "}
                            ·{" "}
                            <span style={{ color: "var(--ok)" }}>
                              avvisato{" "}
                              {r.notifiedAt.toLocaleTimeString("it-IT", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </>
                        ) : (
                          <>
                            {" "}
                            · <span style={{ color: "var(--warn)" }}>mail non partita</span>
                          </>
                        )
                      ) : (
                        <> · senza email</>
                      )}
                    </div>

                    {stato === "proposed" && r.previousStartsAt && (
                      <div className="mt-1 text-xs" style={{ color: "var(--warn)" }}>
                        Spostata dalle{" "}
                        {r.previousStartsAt.toLocaleTimeString("it-IT", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        : il cliente deve ancora accettare.
                      </div>
                    )}
                    {r.notes && (
                      <div
                        className="mt-2 rounded-lg px-2.5 py-1.5 text-sm"
                        style={{
                          background: "var(--warn-bg)",
                          borderLeft: "2px solid var(--warn)",
                        }}
                      >
                        {r.notes}
                      </div>
                    )}
                  </div>

                  {!chiuso && (
                    <form action={assegnaTavoli} className="w-40 shrink-0">
                      <input type="hidden" name="id" value={r.id} />
                      <Select
                        size="sm"
                        name="tavoli"
                        defaultValue={valoreTavoli}
                        options={opzioni}
                        submitOnChange
                      />
                    </form>
                  )}
                </div>

                {!chiuso && (
                  <>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(stato === "pending" || stato === "proposed") && (
                        <form action={confermaPrenotazione}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn btn-primary btn-sm">Conferma</button>
                        </form>
                      )}
                      {stato !== "seated" && (
                        <form action={segnaArrivati}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="btn btn-sm">Sono arrivati</button>
                        </form>
                      )}
                      <form action={segnaAssente}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-sm">Non presentati</button>
                      </form>
                      <form action={annullaPrenotazione}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn btn-sm" style={{ color: "var(--danger)" }}>
                          {stato === "pending" ? "Rifiuta" : "Annulla"}
                        </button>
                      </form>
                    </div>

                    {/* Spostare invece di rifiutare: quasi sempre il tavolo
                        c'e', ma mezz'ora dopo. La proposta parte per mail e
                        aspetta il si' del cliente. */}
                    <details className="disclosure mt-2">
                      <summary>Sposta a un altro orario</summary>
                      <div className="disclosure-body">
                        <form
                          action={spostaPrenotazione}
                          className="flex flex-wrap items-end gap-2"
                        >
                          <input type="hidden" name="id" value={r.id} />
                          <Field label="Giorno" className="min-w-[9.5rem]">
                            <input
                              type="date"
                              name="giorno"
                              defaultValue={dataISO(r.startsAt)}
                              className="input"
                            />
                          </Field>
                          <Field label="Ora" className="min-w-[7rem]">
                            <CampoOra
                              name="ora"
                              passo={15}
                              defaultValue={ora}
                              size="sm"
                            />
                          </Field>
                          <Field label="Persone" className="w-24">
                            <input
                              type="number"
                              name="persone"
                              min={1}
                              max={50}
                              defaultValue={r.partySize}
                              className="input tnum"
                            />
                          </Field>
                          <button className="btn btn-sm">
                            Sposta e avvisa
                          </button>
                        </form>
                        <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                          Il tavolo nuovo viene bloccato subito e al cliente
                          parte la mail: resta «attende il cliente» finché non
                          accetta.
                        </p>
                      </div>
                    </details>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Un tavolo resta occupato {cfg.durataMinuti} minuti dall&apos;ora della
        prenotazione. La durata, il numero di persone accettate online e la
        conferma automatica si cambiano in{" "}
        <Link href="/dashboard/impostazioni" className="underline">
          Impostazioni
        </Link>
        .
      </p>
    </div>
  );
}
