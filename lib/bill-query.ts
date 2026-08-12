import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { billSettlements, orderItems, orders, tenants } from "@/lib/db/schema";
import { buildTable, type BillLine, type BillTable } from "@/lib/bill";

// Carica i conti aperti di un locale. Sta a parte dalla route perche' lo usa
// anche l'incasso: il totale da congelare dev'essere calcolato con le stesse
// regole che il cassiere vede a schermo.
export async function loadOpenTables(
  tenantId: string,
  onlyTable?: number
): Promise<BillTable[]> {
  const tenant = (
    await db
      .select({ coverChargeCents: tenants.coverChargeCents })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1)
  )[0];
  const coverChargeCents = tenant?.coverChargeCents ?? 0;

  const os = await db
    .select({
      id: orders.id,
      tableNumber: orders.tableNumber,
      status: orders.status,
      partySize: orders.partySize,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), isNull(orders.closedAt)))
    .orderBy(asc(orders.tableNumber));

  const wanted =
    onlyTable === undefined ? os : os.filter((o) => o.tableNumber === onlyTable);
  const ids = wanted.map((o) => o.id);
  if (!ids.length) return [];

  const its = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids));

  const settlements = await db
    .select({
      tableNumber: billSettlements.tableNumber,
      alias: billSettlements.alias,
      amountCents: billSettlements.amountCents,
    })
    .from(billSettlements)
    .where(eq(billSettlements.tenantId, tenantId));

  const orderTable = new Map(wanted.map((o) => [o.id, o.tableNumber]));

  // Un ordine annullato per intero non e' piu' "in corso": non arrivera' mai
  // niente, e segnalarlo bloccherebbe la chiusura del tavolo per nulla.
  const conRigheVive = new Set(
    its.filter((i) => i.voidedAt === null).map((i) => i.orderId)
  );

  const pending = new Map<number, boolean>();
  // Se due telefoni dichiarano numeri diversi si tiene il maggiore, cosi'
  // nessuno resta senza coperto.
  const partySizes = new Map<number, number>();
  for (const o of wanted) {
    if (
      (o.status === "new" || o.status === "preparing") &&
      conRigheVive.has(o.id)
    ) {
      pending.set(o.tableNumber, true);
    }
    if (o.partySize) {
      partySizes.set(
        o.tableNumber,
        Math.max(partySizes.get(o.tableNumber) ?? 0, o.partySize)
      );
    }
  }

  const settledByTable = new Map<number, Map<string, number>>();
  for (const s of settlements) {
    if (!settledByTable.has(s.tableNumber)) {
      settledByTable.set(s.tableNumber, new Map());
    }
    settledByTable.get(s.tableNumber)!.set(s.alias, s.amountCents);
  }

  const tablesMap = new Map<number, Map<string, BillLine[]>>();
  for (const it of its) {
    const tn = orderTable.get(it.orderId);
    if (tn === undefined) continue;
    if (!tablesMap.has(tn)) tablesMap.set(tn, new Map());
    const am = tablesMap.get(tn)!;
    const alias = it.alias ?? "Tavolo";
    if (!am.has(alias)) am.set(alias, []);
    am.get(alias)!.push({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      priceCents: it.priceCents,
      paid: it.paid,
      note: it.note,
      priceAdjusted: it.priceAdjusted,
      voided: it.voidedAt !== null,
    });
  }

  return [...tablesMap.entries()]
    .map(([tableNumber, byAlias]) =>
      buildTable({
        tableNumber,
        byAlias,
        declaredPartySize: partySizes.get(tableNumber) ?? null,
        coverChargeCents,
        settled: settledByTable.get(tableNumber) ?? new Map(),
        hasPending: !!pending.get(tableNumber),
      })
    )
    .sort((a, b) => a.tableNumber - b.tableNumber);
}
