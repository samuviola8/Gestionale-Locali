import QRCode from "qrcode";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { addTable, addTableRange, deleteTable } from "./actions";

function tableUrl(slug: string, number: number, token: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  // /apri valida il token e apre la sessione a scadenza per quel tavolo.
  return `${proto}://${slug}.${root}/t/${number}/apri?k=${token}`;
}

export default async function TablesAdmin() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const rows = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.tenantId, session.tenantId))
    .orderBy(asc(restaurantTables.number));

  const tables = await Promise.all(
    rows.map(async (r) => {
      const url = tableUrl(session.tenantSlug, r.number, r.token);
      const png = await QRCode.toDataURL(url, { margin: 1, width: 220 });
      return { id: r.id, number: r.number, png };
    })
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-medium">Tavoli e QR</h1>

      <div className="flex flex-wrap gap-6">
        <form action={addTable} className="flex gap-2">
          <input
            name="number"
            type="number"
            min="1"
            placeholder="Numero tavolo"
            required
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm text-[var(--brand-on)]">
            Aggiungi tavolo
          </button>
        </form>

        <form action={addTableRange} className="flex items-center gap-2">
          <span className="text-sm text-neutral-500">oppure crea i tavoli da 1 a</span>
          <input
            name="count"
            type="number"
            min="1"
            max="200"
            placeholder="20"
            required
            className="w-20 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
          <button className="rounded-lg border border-neutral-200 px-3 py-2 text-sm">
            Crea in blocco
          </button>
        </form>
      </div>

      {tables.length === 0 ? (
        <p className="text-neutral-500">
          Aggiungi il primo tavolo per generare il QR.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {tables.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-neutral-200 p-3 text-center"
            >
              <div className="text-sm font-medium">Tavolo {t.number}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.png}
                alt={`QR tavolo ${t.number}`}
                className="mx-auto mt-2 h-32 w-32"
              />
              <div className="mt-2 flex items-center justify-center gap-3 text-xs">
                <a
                  download={`tavolo-${t.number}.png`}
                  href={t.png}
                  className="text-[var(--brand-text)]"
                >
                  Scarica
                </a>
                <form action={deleteTable}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-red-600">Elimina</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
