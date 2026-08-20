import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { ALIAS_CONDIVISO, aliasGruppo } from "@/lib/bill";
import { loadOpenTables } from "@/lib/bill-query";
import { capofila } from "@/lib/sedute";

// Chi si siede a meta' serata non deve pagare la sua parte di quello che gli
// altri hanno gia' diviso: quel giro era loro. Il condiviso di prima passa a un
// gruppo intestato a chi c'era, e il condiviso resta vuoto — da li' in poi si
// divide con tutti, compreso chi e' appena arrivato.
//
// Va chiamata prima che il nuovo arrivato ordini qualcosa: finche' non ordina
// il tavolo non lo conosce, ed e' proprio questo che permette di intestare il
// gruppo a chi c'era e basta.
export async function staccaCondiviso(
  tenantId: string,
  tableNumber: number
): Promise<{ ok: boolean; spostate: number }> {
  // Il condiviso vive sul conto, e il conto di due tavoli accostati e' uno
  // solo: si stacca quello del gruppo, non quello del singolo tavolo.
  const tavolo = await capofila(tenantId, tableNumber);
  const conto = (await loadOpenTables(tenantId, tavolo))[0];
  if (!conto) return { ok: false, spostate: 0 };

  const condiviso = conto.shared.find((g) => g.alias === ALIAS_CONDIVISO);
  if (!condiviso?.items.length) return { ok: true, spostate: 0 };

  // I posti di adesso, compresi quelli rimasti senza nome: sono le persone tra
  // cui il condiviso si stava gia' dividendo, cioe' esattamente chi deve
  // continuare a pagarlo.
  const posti = conto.people.map((p) => p.alias);
  if (!posti.length) return { ok: false, spostate: 0 };

  const ids = (
    await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.channel, "tavolo"),
          eq(orders.tableNumber, tavolo),
          isNull(orders.closedAt)
        )
      )
  ).map((o) => o.id);
  if (!ids.length) return { ok: false, spostate: 0 };

  // Solo le voci ancora da pagare: quello che qualcuno ha gia' saldato non si
  // reintesta a nessuno, o gli si cambierebbe il conto sotto i piedi.
  const spostate = await db
    .update(orderItems)
    .set({ alias: aliasGruppo(posti) })
    .where(
      and(
        inArray(orderItems.orderId, ids),
        eq(orderItems.alias, ALIAS_CONDIVISO),
        eq(orderItems.paid, false)
      )
    )
    .returning({ id: orderItems.id });

  return { ok: true, spostate: spostate.length };
}
