import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getTenantFromHost } from "@/lib/tenant-host";
import { getMenu } from "@/lib/menu";
import { getTenantModules } from "@/lib/modules";
import { requireModule } from "@/lib/module-guard";
import OrderClient from "@/components/OrderClient";
import { createStaffOrder, noopCallWaiter } from "../actions";

// La stessa pagina che vede il cliente, aperta dal cameriere. Non e' una copia:
// e' proprio OrderClient, cosi' una modifica al menu o alle note vale per
// entrambi e non si finisce con due interfacce che divergono.
export default async function OrdinaPerTavolo({
  params,
}: {
  params: Promise<{ table: string }>;
}) {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("qr_ordering");

  const tenant = await getTenantFromHost();
  if (!tenant) notFound();

  const tableNumber = parseInt((await params).table, 10) || 0;
  const esiste = await db
    .select({ id: restaurantTables.id })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, session.tenantId),
        eq(restaurantTables.number, tableNumber)
      )
    )
    .limit(1);
  if (!esiste.length) notFound();

  const [menu, modules] = await Promise.all([
    getMenu(session.tenantId),
    getTenantModules(session.tenantId),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tavolo {tableNumber}</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
            Ordine preso a voce. Finisce nella coda come quelli dal QR.
          </p>
        </div>
        <Link href="/dashboard/ordina" className="btn btn-sm">
          Cambia tavolo
        </Link>
      </div>

      <div className="mx-auto w-full max-w-md">
        <OrderClient
          tenantName={tenant.name}
          logoUrl={tenant.logoUrl}
          menu={menu}
          tableNumber={tableNumber}
          skinKey={tenant.menuSkin}
          splitBill={modules.split_bill}
          waiterCall={false}
          staffMode
          submitOrder={createStaffOrder}
          callWaiter={noopCallWaiter}
        />
      </div>
    </div>
  );
}
