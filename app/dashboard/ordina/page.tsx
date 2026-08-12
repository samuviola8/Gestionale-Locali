import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurantTables, orders, orderItems } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { requireModule } from "@/lib/module-guard";

// Il cameriere prende l'ordine a voce e lo batte da qui. Prima cosa: per quale
// tavolo. I tavoli che hanno gia' qualcosa aperto si vedono, cosi' si capisce
// dove si sta aggiungendo invece di aprire un secondo conto per sbaglio.
export default async function ScegliTavolo() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  await requireModule("qr_ordering");

  const tavoli = await db
    .select({ number: restaurantTables.number })
    .from(restaurantTables)
    .where(eq(restaurantTables.tenantId, session.tenantId))
    .orderBy(asc(restaurantTables.number));

  // Tavoli con almeno una riga non ancora incassata.
  const aperti = new Set(
    (
      await db
        .select({ tableNumber: orders.tableNumber })
        .from(orders)
        .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
        .where(
          and(
            eq(orders.tenantId, session.tenantId),
            eq(orderItems.paid, false)
          )
        )
    ).map((r) => r.tableNumber)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ordine al banco</h1>
        <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
          Per chi ordina a voce, al bancone o al tavolo. Scegli dove va.
        </p>
      </div>

      {tavoli.length === 0 ? (
        <div className="card p-5">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Non ci sono ancora tavoli.{" "}
            <Link href="/dashboard/tables" style={{ color: "var(--brand-text)" }}>
              Creali in Tavoli e QR
            </Link>{" "}
            e torna qui.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {tavoli.map((t) => {
            const occupato = aperti.has(t.number);
            return (
              <Link
                key={t.number}
                href={`/dashboard/ordina/${t.number}`}
                className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl text-xl font-semibold transition hover:opacity-80"
                style={{
                  background: occupato ? "var(--brand-50)" : "var(--surface)",
                  border: `1px solid ${occupato ? "var(--brand)" : "var(--border)"}`,
                  color: occupato ? "var(--brand-text)" : "var(--text)",
                }}
              >
                {t.number}
                <span className="mt-0.5 text-[10px] font-normal opacity-70">
                  {occupato ? "conto aperto" : "libero"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
