import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformAdmins, adminSessions } from "@/lib/db/schema";

const COOKIE = "comanda_admin";
const SESSION_DAYS = 14;

export async function createAdminSession(adminId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(adminSessions).values({ adminId, token, expiresAt });
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export type AdminUser = { id: string; email: string };

export async function getAdminUser(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: platformAdmins.id,
      email: platformAdmins.email,
      expiresAt: adminSessions.expiresAt,
    })
    .from(adminSessions)
    .innerJoin(platformAdmins, eq(platformAdmins.id, adminSessions.adminId))
    .where(eq(adminSessions.token, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { id: row.id, email: row.email };
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    await db.delete(adminSessions).where(eq(adminSessions.token, token));
    store.delete(COOKIE);
  }
}
