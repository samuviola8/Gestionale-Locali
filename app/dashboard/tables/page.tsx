import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { restaurantTables, tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { requireAnyModule } from "@/lib/module-guard";
import { getTenantModules } from "@/lib/modules";
import { leggiImpostazioni } from "@/lib/prenotazioni";
import Field from "@/components/Field";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { addTable, addTableRange, deleteTable, salvaPosti } from "./actions";

export default async function TablesAdmin() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  // La pagina serve a due moduli: il QR ci stampa i codici, la prenotazione ci
  // legge quanti posti ha ogni tavolo. Basta averne uno acceso.
  await requireAnyModule(["qr_ordering", "reservations"]);

  const modules = await getTenantModules(session.tenantId);

  const [rows, [locale]] = await Promise.all([
    db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.tenantId, session.tenantId))
      .orderBy(asc(restaurantTables.number)),
    db
      .select({
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
  ]);
  if (!locale) redirect("/login");

  const tables = rows.map((r) => ({
    id: r.id,
    number: r.number,
    seats: r.seats,
    bookable: r.bookable,
    qr: `/dashboard/tables/${r.id}/qr`,
  }));

  // La capienza vera della sala: i posti dei tavoli prenotabili piu' le sedie
  // che il locale ha detto di poter aggiungere. E' il numero che decide quanta
  // gente entra, molto piu' di quanti tavoli ci sono.
  const cfg = leggiImpostazioni(locale);
  const prenotabili = tables.filter((t) => t.bookable);
  const postiTotali = prenotabili.reduce((s, t) => s + t.seats, 0);
  const postiConSedie = postiTotali + prenotabili.length * cfg.sedieExtra;
  // Il gruppo piu' grande che la sala regge: i tavoli piu' capienti che si
  // possono accostare, sommati. E' la domanda che il titolare si fa davvero
  // ("la tavolata da dieci ce la faccio?"), e la risposta non e' il tavolo
  // piu' grande che ha.
  const gruppoMassimo = prenotabili
    .map((t) => t.seats + cfg.sedieExtra)
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, cfg.maxTavoliUniti))
    .reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {modules.qr_ordering ? "Tavoli e QR" : "Tavoli"}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          {tables.length === 0
            ? "Nessun tavolo ancora."
            : modules.qr_ordering
              ? `${tables.length} ${tables.length === 1 ? "tavolo" : "tavoli"}. Stampa un codice per tavolo e attaccalo dove si vede.`
              : `${tables.length} ${tables.length === 1 ? "tavolo" : "tavoli"}, ${postiTotali} posti prenotabili.`}
          {modules.reservations && tables.length > 0 && (
            <>
              {" "}
              In sala entrano{" "}
              <strong style={{ color: "var(--text)" }}>
                {postiConSedie} persone
              </strong>
              {cfg.sedieExtra > 0 &&
                ` (${postiTotali} sedute, più ${cfg.sedieExtra} ${
                  cfg.sedieExtra === 1 ? "sedia" : "sedie"
                } per tavolo)`}
              , e il gruppo più grande che si riesce a sistemare è di{" "}
              <strong style={{ color: "var(--text)" }}>
                {gruppoMassimo} persone
              </strong>
              {cfg.maxTavoliUniti > 1
                ? `, accostando fino a ${cfg.maxTavoliUniti} tavoli.`
                : ", perché i tavoli non si uniscono."}
            </>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <details className="disclosure">
          <summary>Aggiungi un tavolo</summary>
          <div className="disclosure-body">
            <form action={addTable} className="flex flex-wrap gap-2">
              <Field label="Numero del tavolo" className="min-w-[140px] flex-1">
                <input
                  name="number"
                  type="number"
                  min="1"
                  required
                  placeholder="12"
                  className="input"
                />
              </Field>
              <button className="btn btn-primary self-end">Aggiungi</button>
            </form>
          </div>
        </details>

        <details className="disclosure">
          <summary>Crea tutti i tavoli in blocco</summary>
          <div className="disclosure-body">
            <form action={addTableRange} className="flex flex-wrap gap-2">
              <Field
                label="Quanti tavoli"
                hint="Crea i tavoli numerati da 1 a N, saltando quelli che esistono già."
                className="min-w-[140px] flex-1"
              >
                <input
                  name="count"
                  type="number"
                  min="1"
                  max="200"
                  required
                  placeholder="20"
                  className="input"
                />
              </Field>
              <button className="btn self-end">Crea</button>
            </form>
          </div>
        </details>
      </div>

      {/* --- Posti a sedere: e' quello che decide chi entra e chi no ---
          Senza questo numero la prenotazione non sa se il gruppo di sei ci
          sta, e finirebbe per accettare tutti o rifiutare tutti. */}
      {modules.reservations && tables.length > 0 && (
        <section className="card p-4">
          <div className="text-sm font-medium">Posti a sedere</div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            Quante persone stanno a ogni tavolo, e quali si possono dare a chi
            prenota online. Il bancone e i tavoli che tenete per i clienti di
            passaggio si tolgono togliendo la spunta.
          </p>

          <form action={salvaPosti} className="mt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {tables.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span className="text-sm font-medium">Tavolo {t.number}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="number"
                        name={`posti_${t.id}`}
                        defaultValue={t.seats}
                        min={1}
                        max={30}
                        aria-label={`Posti del tavolo ${t.number}`}
                        className="input tnum"
                        style={{ width: 68, minHeight: 38 }}
                      />
                      posti
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        name={`prenotabile_${t.id}`}
                        defaultChecked={t.bookable}
                        className="h-4 w-4 accent-[var(--brand)]"
                      />
                      prenotabile
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-sm mt-3">Salva i posti</button>
          </form>
        </section>
      )}

      {tables.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <div className="text-base font-medium">Nessun tavolo</div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {modules.qr_ordering
              ? "Aggiungi il primo tavolo per generare il suo QR."
              : "Aggiungi i tavoli della sala: sono quelli che si possono prenotare."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((t) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 pt-3">
                <span className="font-semibold">Tavolo {t.number}</span>
                {modules.reservations && (
                  <span className="badge badge-muted">{t.seats} posti</span>
                )}
              </div>

              {/* Bianco messo inline e non con bg-white: in modalita' scura la
                  utility viene riscritta a livello globale, e un QR senza
                  fondo bianco non si fa leggere dalla fotocamera. */}
              {modules.qr_ordering && (
                <div className="mt-2 p-3" style={{ background: "#ffffff" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.qr}
                    alt={`QR del tavolo ${t.number}`}
                    width={320}
                    height={320}
                    loading="lazy"
                    className="mx-auto h-auto w-full"
                  />
                </div>
              )}

              <div
                className="mt-2 flex items-center justify-between gap-2 px-3 py-2.5"
                style={{ background: "var(--surface-2)" }}
              >
                {modules.qr_ordering ? (
                  <a
                    download={`tavolo-${t.number}.png`}
                    href={t.qr}
                    className="btn btn-sm"
                  >
                    Scarica
                  </a>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {t.bookable ? "Prenotabile" : "Non prenotabile"}
                  </span>
                )}
                <form action={deleteTable}>
                  <input type="hidden" name="id" value={t.id} />
                  <ConfirmSubmit
                    label="Elimina"
                    ariaLabel={`Elimina il tavolo ${t.number}`}
                  />
                </form>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {modules.qr_ordering
          ? "Eliminare un tavolo invalida il QR già stampato: chi lo inquadra non riesce più ad aprire il tavolo."
          : "Eliminare un tavolo non tocca le prenotazioni già prese: restano, ma senza posto assegnato."}
      </p>
    </div>
  );
}
