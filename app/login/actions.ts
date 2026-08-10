"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { verifyPassword, createSession } from "@/lib/auth";
import { getTenantFromHost } from "@/lib/tenant-host";

export type LoginState = { ok: boolean; error?: boolean };

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended) return { ok: false, error: true };

  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");

  const rows = await db
    .select({ id: users.id, hash: users.passwordHash })
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, email)))
    .limit(1);

  const u = rows[0];
  const ok = u ? await verifyPassword(password, u.hash) : false;
  if (!ok) return { ok: false, error: true };

  await createSession(u!.id);
  return { ok: true };
}
