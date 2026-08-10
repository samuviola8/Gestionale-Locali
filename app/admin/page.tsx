import { redirect } from "next/navigation";
import { asc, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, users, orders, orderItems } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { formatPrice } from "@/lib/menu";
import ThemeToggle from "@/components/ThemeToggle";
import { adminLogout } from "./actions";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

export default async function AdminPage() {
  const admin = await getAdminUser();
  if (!admin) redirect("/admin/login");

  const allTenants = await db.select().from(tenants).orderBy(asc(tenants.name));

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const todays = await db
    .select({ id: orders.id, tenantId: orders.tenantId })
    .from(orders)
    .where(gte(orders.createdAt, start));
  const todayIds = todays.map((o) => o.id);
  const items = todayIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, todayIds))
    : [];
  const allUsers = await db.select({ tenantId: users.tenantId }).from(users);

  const orderTenant = new Map(todays.map((o) => [o.id, o.tenantId]));
  const ordersByTenant = new Map<string, number>();
  for (const o of todays)
    ordersByTenant.set(o.tenantId, (ordersByTenant.get(o.tenantId) ?? 0) + 1);
  const incassoByTenant = new Map<string, number>();
  for (const it of items) {
    if (!it.paid) continue;
    const t = orderTenant.get(it.orderId);
    if (t) incassoByTenant.set(t, (incassoByTenant.get(t) ?? 0) + it.priceCents * it.quantity);
  }
  const usersByTenant = new Map<string, number>();
  for (const u of allUsers)
    usersByTenant.set(u.tenantId, (usersByTenant.get(u.tenantId) ?? 0) + 1);

  const totalIncassoToday = items
    .filter((i) => i.paid)
    .reduce((s, i) => s + i.priceCents * i.quantity, 0);

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold text-[var(--brand-on)]"
              style={{ background: "var(--brand)" }}
            >
              C
            </div>
            <div>
              <div className="text-sm font-semibold">Comanda</div>
              <div className="text-xs text-neutral-400">Super-admin</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <form action={adminLogout}>
              <button className="text-sm text-neutral-500 hover:text-neutral-800">
                Esci
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
        <h1 className="text-2xl font-semibold">Panoramica</h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Locali" value={allTenants.length} />
          <Stat label="Ordini oggi" value={todays.length} />
          <Stat label="Incasso oggi" value={formatPrice(totalIncassoToday)} />
        </div>

        <section>
          <h2 className="mb-3 text-sm font-medium text-neutral-500">Locali</h2>
          <div className="overflow-hidden rounded-xl border border-neutral-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="px-4 py-2.5 font-medium">Locale</th>
                  <th className="px-4 py-2.5 font-medium">Indirizzo</th>
                  <th className="px-4 py-2.5 font-medium">Ordini oggi</th>
                  <th className="px-4 py-2.5 font-medium">Incasso oggi</th>
                  <th className="px-4 py-2.5 font-medium">Utenti</th>
                </tr>
              </thead>
              <tbody>
                {allTenants.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-neutral-500" colSpan={5}>
                      Nessun locale. Creane uno qui sotto.
                    </td>
                  </tr>
                )}
                {allTenants.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3 font-medium">
                      <a
                        href={`/admin/locali/${t.id}`}
                        className="hover:underline"
                      >
                        {t.name}
                      </a>
                      {t.suspended && (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-xs"
                          style={{ background: "#FAEEDA", color: "#854F0B" }}
                        >
                          Sospeso
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`${proto}://${t.slug}.${root}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--brand-text)]"
                      >
                        {t.slug}.{root}
                      </a>
                    </td>
                    <td className="px-4 py-3">{ordersByTenant.get(t.id) ?? 0}</td>
                    <td className="px-4 py-3">
                      {formatPrice(incassoByTenant.get(t.id) ?? 0)}
                    </td>
                    <td className="px-4 py-3">{usersByTenant.get(t.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <a
            href="/admin/locali/nuovo"
            className="flex items-center justify-between rounded-xl border border-dashed border-neutral-300 px-5 py-4 transition hover:border-[var(--brand)]"
          >
            <span>
              <span className="block text-sm font-medium">Aggiungi un locale</span>
              <span className="mt-0.5 block text-xs text-neutral-500">
                Anagrafica, tema, moduli, tavoli e QR in un unico passaggio.
              </span>
            </span>
            <span
              className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--brand-on)]"
              style={{ background: "var(--brand)" }}
            >
              Inizia
            </span>
          </a>
        </section>
      </main>
    </div>
  );
}
