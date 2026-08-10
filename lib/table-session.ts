import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurantTables, tableSessions } from "@/lib/db/schema";
import type { Tenant } from "@/lib/tenants";

// Il QR stampato contiene un token permanente del tavolo. Scansionandolo si
// apre una sessione a scadenza: quando scade il cliente deve riscansionare,
// cosi' il link non resta buono per ordinare da casa il giorno dopo.

const COOKIE_PREFIX = "comanda_table_";

// Un cookie per locale: due locali aperti sullo stesso telefono non si pestano.
function cookieName(tenantId: string): string {
  return COOKIE_PREFIX + tenantId;
}

export type TableSession = {
  tableNumber: number;
  expiresAt: Date;
};

// Verifica il token stampato sul QR e apre una sessione per quel tavolo.
export async function openTableSession(
  tenant: Tenant,
  tableNumber: number,
  qrToken: string
): Promise<TableSession | null> {
  if (!Number.isInteger(tableNumber) || tableNumber <= 0) return null;
  if (!qrToken) return null;

  const rows = await db
    .select({ id: restaurantTables.id, token: restaurantTables.token })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, tenant.id),
        eq(restaurantTables.number, tableNumber)
      )
    )
    .limit(1);

  const table = rows[0];
  if (!table || table.token !== qrToken) return null;

  const minutes = tenant.tableSessionMinutes > 0 ? tenant.tableSessionMinutes : 120;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  const token = randomBytes(32).toString("hex");

  await db.insert(tableSessions).values({
    tenantId: tenant.id,
    tableId: table.id,
    tableNumber,
    token,
    expiresAt,
  });

  const store = await cookies();
  store.set(cookieName(tenant.id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { tableNumber, expiresAt };
}

// Sessione valida per questo locale, se c'e'. Non fidarsi del numero di tavolo
// che arriva dal client: quello buono e' quello registrato nella sessione.
export async function getTableSession(
  tenantId: string
): Promise<TableSession | null> {
  const store = await cookies();
  const token = store.get(cookieName(tenantId))?.value;
  if (!token) return null;

  const rows = await db
    .select({
      tableNumber: tableSessions.tableNumber,
      expiresAt: tableSessions.expiresAt,
    })
    .from(tableSessions)
    .where(
      and(
        eq(tableSessions.token, token),
        eq(tableSessions.tenantId, tenantId),
        isNull(tableSessions.revokedAt),
        gt(tableSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

// Come sopra, ma pretende che la sessione sia proprio per quel tavolo.
export async function requireTableSession(
  tenantId: string,
  tableNumber: number
): Promise<TableSession | null> {
  const session = await getTableSession(tenantId);
  if (!session || session.tableNumber !== tableNumber) return null;
  return session;
}

// Lo staff chiude il conto: i telefoni ancora al tavolo perdono l'accesso.
export async function revokeTableSessions(
  tenantId: string,
  tableNumber: number
): Promise<void> {
  await db
    .update(tableSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(tableSessions.tenantId, tenantId),
        eq(tableSessions.tableNumber, tableNumber),
        isNull(tableSessions.revokedAt)
      )
    );
}

// Pulizia delle sessioni vecchie, richiamata dalle pagine dello staff.
export async function purgeExpiredTableSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(tableSessions).where(lt(tableSessions.expiresAt, cutoff));
}
