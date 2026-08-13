import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { getSessionUser, repartoAttivo } from "@/lib/auth";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ orders: [] }, { status: 401 });
  }

  const os = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, session.tenantId),
        inArray(orders.status, ["new", "preparing"])
      )
    )
    .orderBy(asc(orders.createdAt));

  const ids = os.map((o) => o.id);
  const its = ids.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids))
    : [];

  const result = os.map((o) => ({
    id: o.id,
    tableNumber: o.tableNumber,
    // Da dove arriva l'ordine: cambia il titolo della card e le soglie di
    // attesa, perche' un domicilio e un tavolo non aspettano allo stesso modo.
    channel: o.channel,
    customerName: o.customerName,
    customerAddress: o.customerAddress,
    dueAt: o.dueAt?.toISOString() ?? null,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    items: its
      .filter((i) => i.orderId === o.id)
      .map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        alias: i.alias,
        // Richiesta scritta dal cliente e prezzo, che il barman puo' correggere
        // proprio da qui: e' dove la legge.
        note: i.note,
        priceCents: i.priceCents,
        priceAdjusted: i.priceAdjusted,
        voided: i.voidedAt !== null,
        repartoId: i.repartoId,
      })),
  }));

  // Chi e' assegnato a un reparto vede solo la sua parte: al pizzaiolo i
  // cocktail non servono, e una coda piena di roba altrui e' una coda che non
  // si legge.
  const mio = repartoAttivo(session);
  const filtrato = mio
    ? result
        .map((o) => ({
          ...o,
          items: o.items.filter((i) => i.repartoId === mio),
        }))
        .filter((o) => o.items.length > 0)
    : result;

  // Un ordine annullato per intero non ha piu' niente da preparare: sparisce
  // dalla coda, ma le righe restano sul conto per la traccia.
  const daPreparare = filtrato.filter((o) => o.items.some((i) => !i.voided));

  return NextResponse.json({ orders: daPreparare });
}
