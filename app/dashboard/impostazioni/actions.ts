"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuCategories, reparti, tenants, users } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { leggiOrari, type OrariApertura } from "@/lib/orari";

async function requireOwner(): Promise<string> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  // Chi prepara non riconfigura il locale.
  if (s.role !== "owner") redirect("/dashboard");
  return s.tenantId;
}

export async function addReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;

  const quanti = await db
    .select({ id: reparti.id })
    .from(reparti)
    .where(eq(reparti.tenantId, tenantId));

  await db
    .insert(reparti)
    .values({ tenantId, name, sortOrder: quanti.length });
  revalidatePath("/dashboard/impostazioni");
}

export async function deleteReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const id = String(formData.get("id") ?? "");
  // Le categorie e gli account che lo puntavano tornano senza reparto invece
  // di sparire: e' quello che fa `on delete set null` a schema.
  await db
    .delete(reparti)
    .where(and(eq(reparti.id, id), eq(reparti.tenantId, tenantId)));
  revalidatePath("/dashboard/impostazioni");
}

// A quale postazione va preparata una categoria. Vuoto = coda generale.
export async function setCategoriaReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const categoriaId = String(formData.get("categoriaId") ?? "");
  const raw = String(formData.get("repartoId") ?? "");
  const repartoId = raw || null;
  if (!categoriaId) return;

  if (repartoId) {
    const suo = await db
      .select({ id: reparti.id })
      .from(reparti)
      .where(and(eq(reparti.id, repartoId), eq(reparti.tenantId, tenantId)))
      .limit(1);
    if (!suo.length) return;
  }

  await db
    .update(menuCategories)
    .set({ repartoId })
    .where(
      and(
        eq(menuCategories.id, categoriaId),
        eq(menuCategories.tenantId, tenantId)
      )
    );
  revalidatePath("/dashboard/impostazioni");
}

export async function setUtenteReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const raw = String(formData.get("repartoId") ?? "");
  const repartoId = raw || null;
  if (!userId) return;

  await db
    .update(users)
    .set({ repartoId })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  revalidatePath("/dashboard/impostazioni");
}

// Gli orari di apertura. Da qui si ricavano le fasce di ritiro, quindi si
// ripuliscono prima di scrivere: una fascia storta a database vorrebbe dire
// proporre consegne a serranda abbassata.
export async function salvaOrari(orari: OrariApertura): Promise<void> {
  const tenantId = await requireOwner();
  await db
    .update(tenants)
    .set({ openingHours: leggiOrari(orari) })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/impostazioni");
}

// Gli interruttori della stampa. Arrivano tutti insieme dal form: le caselle
// non spuntate non compaiono in FormData, quindi assenza = spento.
export async function salvaStampa(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const on = (k: string) => formData.get(k) === "on";

  await db
    .update(tenants)
    .set({
      printComandaTavolo: on("tavolo"),
      printComandaBanco: on("banco"),
      printComandaAsporto: on("asporto"),
      printComandaDomicilio: on("domicilio"),
      printContoAllaChiusura: on("contoChiusura"),
      printScontrinoCassa: on("scontrinoCassa"),
    })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/impostazioni");
}
