import { redirect } from "next/navigation";
import { asc, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants, users, orders, orderItems } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { segnalazioniAperte } from "@/lib/segnalazioni-query";
import { formatPrice } from "@/lib/menu";
import ThemeToggle from "@/components/ThemeToggle";
import { adminLogout } from "./actions";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
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
  const daVedere = await segnalazioniAperte();

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
      <header style={{ borderBottom: "1px solid var(--border)" }}>
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
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
            Locali
          </h2>
          <div className="card overflow-hidden">
            {allTenants.length === 0 && (
              <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                Nessun locale. Creane uno qui sotto.
              </p>
            )}

            {allTenants.map((t, i) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
                style={
                  i > 0 ? { borderTop: "1px solid var(--border)" } : undefined
                }
              >
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/admin/locali/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </a>
                    {t.suspended && <span className="badge badge-warn">Sospeso</span>}
                  </div>
                  <a
                    href={`${proto}://${t.slug}.${root}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs hover:underline"
                    style={{ color: "var(--brand-text)" }}
                  >
                    {t.slug}.{root}
                  </a>
                </div>

                <div className="flex gap-6 text-sm">
                  <div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      Ordini oggi
                    </div>
                    <div className="tnum font-medium">
                      {ordersByTenant.get(t.id) ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      Incasso oggi
                    </div>
                    <div className="tnum font-medium">
                      {formatPrice(incassoByTenant.get(t.id) ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      Utenti
                    </div>
                    <div className="tnum font-medium">
                      {usersByTenant.get(t.id) ?? 0}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <a
            href="/admin/segnalazioni"
            className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 transition hover:border-[var(--brand)]"
            style={{ border: "1px solid var(--border)" }}
          >
            <span>
              <span className="block text-sm font-medium">Segnalazioni</span>
              <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                {daVedere === 0
                  ? "Nessuna in attesa di risposta."
                  : daVedere === 1
                    ? "Una aspetta una risposta."
                    : `${daVedere} aspettano una risposta.`}
              </span>
            </span>
            {daVedere > 0 && <span className="badge badge-danger">{daVedere}</span>}
          </a>
        </section>

        <section>
          <a
            href="/admin/locali/nuovo"
            className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 transition hover:border-[var(--brand)]"
            style={{ border: "1px dashed var(--border)" }}
          >
            <span>
              <span className="block text-sm font-medium">Aggiungi un locale</span>
              <span className="mt-0.5 block text-xs" style={{ color: "var(--muted)" }}>
                Anagrafica, tema, moduli, tavoli e QR in un unico passaggio.
              </span>
            </span>
            <span className="btn btn-primary btn-sm">Inizia</span>
          </a>
        </section>
      </main>
    </div>
  );
}
