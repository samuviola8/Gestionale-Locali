import { NextResponse } from "next/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { requireTableSession } from "@/lib/table-session";
import { loadOpenTables } from "@/lib/bill-query";
import { ALIAS_CONDIVISO, eGruppo, membriDi } from "@/lib/bill";

// Usato dalla pagina cliente per lo stato del proprio tavolo: richiede la
// sessione aperta col QR, altrimenti si leggerebbero gli ordini altrui.
export async function GET(req: Request) {
  const tenant = await getTenantFromHost();
  if (!tenant) return NextResponse.json({ orders: [] });

  const { searchParams } = new URL(req.url);
  const table = parseInt(searchParams.get("table") ?? "", 10);
  if (!Number.isInteger(table)) return NextResponse.json({ orders: [] });

  if (!(await requireTableSession(tenant.id, table)))
    return NextResponse.json({ orders: [], scaduta: true }, { status: 401 });

  const os = await db
    .select({
      id: orders.id,
      status: orders.status,
      createdAt: orders.createdAt,
      partySize: orders.partySize,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenant.id),
        eq(orders.tableNumber, table),
        isNull(orders.closedAt)
      )
    )
    .orderBy(asc(orders.createdAt));

  const ids = os.map((o) => o.id);
  const its = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
    : [];

  const result = os.map((o) => ({
    id: o.id,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    items: its
      .filter((i) => i.orderId === o.id)
      .map((i) => ({
        name: i.name,
        quantity: i.quantity,
        alias: i.alias,
        voided: i.voidedAt !== null,
      })),
  }));

  // Stesso calcolo che vede il cassiere, non un conteggio parallelo: se lo
  // staff corregge le persone al tavolo, qui cambia di conseguenza.
  const conto = (await loadOpenTables(tenant.id, table))[0] ?? null;

  // In quanti sono, se qualcuno l'ha gia' detto. Non e' il numero del conto,
  // che quando nessuno ha risposto lo deduce da chi ha ordinato: qui serve
  // sapere se la domanda ha gia' avuto una risposta, non una stima.
  const personeDichiarate =
    os.reduce((m, o) => Math.max(m, o.partySize ?? 0), 0) || null;

  // I nomi gia' in uso al tavolo, da qualunque telefono siano stati scritti.
  // Senza, ogni telefono conosce solo chi ci ha digitato sopra, e dividere con
  // chi ha ordinato dall'altro telefono e' impossibile: per lui non esiste.
  // Un alias di gruppo vale per le persone che nomina.
  const persone = [
    ...new Set(
      its.flatMap((i) => {
        const a = i.alias ?? "";
        if (!a || a === "Tavolo" || a === ALIAS_CONDIVISO) return [];
        return eGruppo(a) ? membriDi(a) : [a];
      })
    ),
  ];

  return NextResponse.json({ orders: result, conto, personeDichiarate, persone });
}
