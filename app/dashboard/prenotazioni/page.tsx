import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
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
  STATI_ATTIVI,
  dataISO,
  etichettaTavoli,
  fineServizio,
  finestraGiorno,
  giornoLeggibile,
  isStato,
  leggiImpostazioni,
  postiPrenotabili,
  type StatoPrenotazione,
} from "@/lib/prenotazioni";
import { seduteAperte } from "@/lib/sedute";
import Field from "@/components/Field";
import CampoOra from "@/components/CampoOra";
import ScegliTavoli from "@/components/ScegliTavoli";
import PulsanteArrivati from "@/components/PulsanteArrivati";
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

  // Chi tiene occupato cosa, per poterlo dire a chi sposta i tavoli a mano.
  // Si guarda oltre il giorno mostrato: una prenotazione delle 23:30 tiene il
  // tavolo fino all'una, e per chi prenota a mezzanotte quel tavolo non c'e'.
  const [daFinestra, aFinestra] = finestraGiorno(inizioGiorno, cfg);
  const vicine = await db
    .select({
      id: reservations.id,
      startsAt: reservations.startsAt,
      customerName: reservations.customerName,
      tableNumbers: reservations.tableNumbers,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.tenantId, session.tenantId),
        gte(reservations.startsAt, daFinestra),
        lt(reservations.startsAt, aFinestra),
        inArray(reservations.status, STATI_ATTIVI)
      )
    );

  // E chi e' seduto adesso, che e' l'altra meta' della stessa domanda: un
  // tavolo libero in agenda puo' avere sopra una comitiva arrivata senza
  // prenotare, e assegnarlo senza saperlo vuol dire mandarci qualcuno che
  // trova le sedie piene.
  const sedute = await seduteAperte(session.tenantId);

  // Perche' dare questo tavolo a questo gruppo e' un problema, se lo e'.
  function avvisoTavolo(
    id: string,
    inizio: Date
  ): Map<number, string> {
    const da = inizio.getTime();
    const a = fineServizio(inizio, cfg).getTime();
    const note = new Map<number, string[]>();
    const aggiungi = (n: number, testo: string) => {
      if (!note.has(n)) note.set(n, []);
      note.get(n)!.push(testo);
    };

    // La seduta di questo stesso gruppo non e' un avviso: sono loro.
    for (const s of sedute) {
      if (s.reservationId === id) continue;
      for (const n of s.tavoli) aggiungi(n, "c'è gente seduta adesso");
    }

    for (const v of vicine) {
      if (v.id === id) continue;
      const suoDa = v.startsAt.getTime();
      const suoA = fineServizio(v.startsAt, cfg).getTime();
      if (suoDa >= a || suoA <= da) continue;
      const quando = v.startsAt.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      });
      for (const n of v.tableNumbers) {
        aggiungi(n, `lo tiene ${v.customerName} alle ${quando}`);
      }
    }

    return new Map([...note].map(([n, testi]) => [n, testi.join("; ")]));
  }

  // L'ora da cui parte il campo della prenotazione al telefono: adesso,
  // arrotondato al quarto d'ora successivo. Chi prende una prenotazione a voce
  // la prende quasi sempre per fra poco, e una tendina che parte da mezzanotte
  // gli fa scorrere ottanta orari gia' passati per arrivare a quello in cui
  // sta lavorando.
  const fraPoco = new Date(adesso);
  fraPoco.setMinutes(Math.ceil(fraPoco.getMinutes() / 15) * 15, 0, 0);
  const oraDiPartenza = fraPoco.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

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
              <CampoOra name="ora" passo={15} defaultValue={oraDiPartenza} />
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
            const presi = avvisoTavolo(r.id, r.startsAt);
            // Tutti i tavoli della sala, non solo i prenotabili: il bancone e
            // i due sgabelli non si danno a chi prenota dal web, ma il locale
            // che sistema una comitiva a mano ci mette chi vuole.
            const sceltaTavoli = tavoli.map((t) => ({
              numero: t.numero,
              posti: t.posti,
              prenotabile: t.prenotabile,
              avviso: presi.get(t.numero) ?? null,
            }));

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
                      {/* Dove li mettiamo. Prima stava solo dentro il menu che
                          serviva a cambiarlo: per leggerlo bisognava aprirlo. */}
                      <span
                        className="badge badge-muted"
                        style={
                          r.tableNumbers.length
                            ? undefined
                            : { color: "var(--warn)" }
                        }
                      >
                        {etichettaTavoli(r.tableNumbers) ?? "Senza tavolo"}
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
                        <PulsanteArrivati
                          reservationId={r.id}
                          pannelloTavoli={`tavoli-${r.id}`}
                          segna={segnaArrivati}
                        />
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

                    {/* I tavoli a mano. L'automatico accosta quello che trova,
                        ma la comitiva da diciotto la si vuole tutta sulla
                        stessa fila, e quello lo sa solo chi la sala ce l'ha
                        davanti. */}
                    <details className="disclosure mt-2" id={`tavoli-${r.id}`}>
                      <summary>
                        Cambia i tavoli
                        {r.tableNumbers.length > 0 && (
                          <> · {etichettaTavoli(r.tableNumbers)}</>
                        )}
                      </summary>
                      <div className="disclosure-body">
                        <ScegliTavoli
                          reservationId={r.id}
                          tavoli={sceltaTavoli}
                          assegnati={r.tableNumbers}
                          persone={r.partySize}
                          sedieExtra={cfg.sedieExtra}
                          assegna={assegnaTavoli}
                        />
                      </div>
                    </details>

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
