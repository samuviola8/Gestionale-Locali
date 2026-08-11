import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { requireModule } from "@/lib/module-guard";
import Field from "@/components/Field";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { addTable, addTableRange, deleteTable } from "./actions";

export default async function TablesAdmin() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("qr_ordering");

  const rows = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.tenantId, session.tenantId))
    .orderBy(asc(restaurantTables.number));

  const tables = rows.map((r) => ({
    id: r.id,
    number: r.number,
    qr: `/dashboard/tables/${r.id}/qr`,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tavoli e QR</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          {tables.length === 0
            ? "Nessun tavolo ancora."
            : `${tables.length} ${tables.length === 1 ? "tavolo" : "tavoli"}. Stampa un codice per tavolo e attaccalo dove si vede.`}
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

      {tables.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <div className="text-base font-medium">Nessun tavolo</div>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Aggiungi il primo tavolo per generare il suo QR.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tables.map((t) => (
            <div key={t.id} className="card overflow-hidden">
              <div className="flex items-center justify-between px-3 pt-3">
                <span className="font-semibold">Tavolo {t.number}</span>
              </div>

              {/* Bianco messo inline e non con bg-white: in modalita' scura la
                  utility viene riscritta a livello globale, e un QR senza
                  fondo bianco non si fa leggere dalla fotocamera. */}
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

              <div
                className="flex items-center justify-between gap-2 px-3 py-2.5"
                style={{ background: "var(--surface-2)" }}
              >
                <a
                  download={`tavolo-${t.number}.png`}
                  href={t.qr}
                  className="btn btn-sm"
                >
                  Scarica
                </a>
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
        Eliminare un tavolo invalida il QR già stampato: chi lo inquadra
        non riesce più ad aprire il tavolo.
      </p>
    </div>
  );
}
