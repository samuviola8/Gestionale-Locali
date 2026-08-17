"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { createTables } from "@/lib/tables";

async function requireTenantId(): Promise<string> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  return s.tenantId;
}

export async function addTable(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const number = parseInt(String(formData.get("number") ?? ""), 10);
  if (!Number.isInteger(number) || number <= 0) return;
  await createTables(tenantId, [number]);
  revalidatePath("/dashboard/tables");
}

// Crea i tavoli da 1 a N in un colpo solo: e' il caso normale quando si
// configura un locale nuovo.
export async function addTableRange(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const count = parseInt(String(formData.get("count") ?? ""), 10);
  if (!Number.isInteger(count) || count <= 0) return;
  await createTables(
    tenantId,
    Array.from({ length: Math.min(count, 200) }, (_, i) => i + 1)
  );
  revalidatePath("/dashboard/tables");
}

// Posti e prenotabilita' di tutti i tavoli in un colpo solo. Salvare tavolo
// per tavolo vorrebbe dire venti salvataggi per configurare una sala: qui si
// sistema la griglia e si preme una volta. Le caselle non spuntate non
// compaiono in FormData, quindi assenza = non prenotabile.
export async function salvaPosti(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();

  const righe = await db
    .select({ id: restaurantTables.id })
    .from(restaurantTables)
    .where(eq(restaurantTables.tenantId, tenantId));

  for (const r of righe) {
    const posti = parseInt(String(formData.get(`posti_${r.id}`) ?? ""), 10);
    // Un tavolo assente dal modulo non si tocca: il form potrebbe essere
    // stato inviato mentre qualcun altro ne aggiungeva uno.
    if (!formData.has(`posti_${r.id}`)) continue;

    await db
      .update(restaurantTables)
      .set({
        seats: Number.isInteger(posti) && posti >= 1 && posti <= 30 ? posti : 2,
        bookable: formData.get(`prenotabile_${r.id}`) === "on",
      })
      .where(
        and(
          eq(restaurantTables.id, r.id),
          eq(restaurantTables.tenantId, tenantId)
        )
      );
  }

  revalidatePath("/dashboard/tables");
  revalidatePath("/dashboard/prenotazioni");
}

export async function deleteTable(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  await db
    .delete(restaurantTables)
    .where(
      and(eq(restaurantTables.id, id), eq(restaurantTables.tenantId, tenantId))
    );
  revalidatePath("/dashboard/tables");
}
