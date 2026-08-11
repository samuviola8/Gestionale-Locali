import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { formatPrice } from "@/lib/menu";
import { getTenantModules } from "@/lib/modules";
import { IconOrders, IconBill, IconMenu, IconQr } from "@/components/icons";

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  // Evidenzia il dato che richiede un'azione adesso (gli ordini in coda).
  accent?: boolean;
}) {
  return (
    <div
      className="stat"
      style={
        accent
          ? { borderColor: "var(--brand)", background: "var(--brand-50)" }
          : undefined
      }
    >
      <div className="stat-label">{label}</div>
      <div
        className="stat-value"
        style={accent ? { color: "var(--brand-text)" } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

export default async function DashboardHome() {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const todays = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, session.tenantId), gte(orders.createdAt, start)));
  const ordersToday = todays.length;

  const todayIds = todays.map((o) => o.id);
  const todayItems = todayIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, todayIds))
    : [];
  const incassoToday = todayItems
    .filter((i) => i.paid)
    .reduce((s, i) => s + i.priceCents * i.quantity, 0);

  const open = await db
    .select({ tableNumber: orders.tableNumber, status: orders.status })
    .from(orders)
    .where(and(eq(orders.tenantId, session.tenantId), isNull(orders.closedAt)));
  const tavoliAperti = new Set(open.map((o) => o.tableNumber)).size;
  const inCoda = open.filter(
    (o) => o.status === "new" || o.status === "preparing"
  ).length;

  const today = new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);

  // Le scorciatoie seguono i moduli attivi, come le voci del menu laterale.
  const modules = await getTenantModules(session.tenantId);
  const links = [
    {
      href: "/dashboard/orders",
      label: "Coda ordini",
      desc: "Ordini in arrivo",
      Icon: IconOrders,
      module: "qr_ordering" as const,
    },
    {
      href: "/dashboard/bill",
      label: "Conti aperti",
      desc: "Incassa e chiudi",
      Icon: IconBill,
      module: "split_bill" as const,
    },
    { href: "/dashboard/menu", label: "Menu", desc: "Prodotti e foto", Icon: IconMenu },
    {
      href: "/dashboard/tables",
      label: "Tavoli e QR",
      desc: "Genera i codici",
      Icon: IconQr,
      module: "qr_ordering" as const,
    },
  ].filter((l) => !l.module || modules[l.module]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">{session.tenantName}</h1>
        <p className="mt-0.5 text-sm capitalize" style={{ color: "var(--muted)" }}>
          {today}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In coda adesso" value={inCoda} accent={inCoda > 0} />
        <Stat label="Tavoli aperti" value={tavoliAperti} />
        <Stat label="Ordini oggi" value={ordersToday} />
        <Stat label="Incasso oggi" value={formatPrice(incassoToday)} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--muted)" }}>
          Gestione
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {links.map(({ href, label, desc, Icon }) => (
            <Link
              key={href}
              href={href}
              className="card p-4 transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{
                  background: "var(--brand-50)",
                  color: "var(--brand-text)",
                }}
              >
                <Icon size={18} />
              </div>
              <div className="mt-3 font-medium">{label}</div>
              <div className="text-sm" style={{ color: "var(--muted)" }}>
                {desc}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
