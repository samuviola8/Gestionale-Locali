"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { getSessionUser, hashPassword } from "@/lib/auth";

export async function addUser(formData: FormData): Promise<void> {
  const s = await getSessionUser();
  if (!s || s.role !== "owner") return;

  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") === "owner" ? "owner" : "staff";
  if (!email || password.length < 6) return;

  const passwordHash = await hashPassword(password);
  await db
    .insert(users)
    .values({ tenantId: s.tenantId, email, passwordHash, role })
    .onConflictDoNothing();
  revalidatePath("/dashboard/staff");
}

export async function deleteUser(formData: FormData): Promise<void> {
  const s = await getSessionUser();
  if (!s || s.role !== "owner") return;
  const id = String(formData.get("id") ?? "");
  if (!id || id === s.userId) return; // non puoi eliminare te stesso
  await db.delete(users).where(and(eq(users.id, id), eq(users.tenantId, s.tenantId)));
  revalidatePath("/dashboard/staff");
}

export async function resetPassword(formData: FormData): Promise<void> {
  const s = await getSessionUser();
  if (!s || s.role !== "owner") return;
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!id || password.length < 6) return;

  const passwordHash = await hashPassword(password);
  await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.id, id), eq(users.tenantId, s.tenantId)));
  // forza il nuovo accesso: invalida le sessioni di quell'utente
  await db.delete(sessions).where(eq(sessions.userId, id));
  revalidatePath("/dashboard/staff");
}
