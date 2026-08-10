"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformAdmins } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/auth";
import { createAdminSession } from "@/lib/admin-auth";

export type AdminLoginState = { ok: boolean; error?: boolean };

export async function adminLogin(
  _prev: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");

  const rows = await db
    .select({ id: platformAdmins.id, hash: platformAdmins.passwordHash })
    .from(platformAdmins)
    .where(eq(platformAdmins.email, email))
    .limit(1);

  const a = rows[0];
  const ok = a ? await verifyPassword(password, a.hash) : false;
  if (!ok) return { ok: false, error: true };

  await createAdminSession(a!.id);
  return { ok: true };
}
