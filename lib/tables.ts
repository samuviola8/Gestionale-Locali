import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";

// Creazione tavoli condivisa tra dashboard del locale e onboarding admin.
// Vive fuori dai file "use server": li' ogni export diventa un'azione
// invocabile dal client, e questa funzione riceve il tenantId dal chiamante.
export async function createTables(
  tenantId: string,
  numbers: number[]
): Promise<number> {
  const clean = [...new Set(numbers)].filter(
    (n) => Number.isInteger(n) && n > 0 && n <= 999
  );
  if (!clean.length) return 0;

  const inserted = await db
    .insert(restaurantTables)
    .values(
      clean.map((number) => ({
        tenantId,
        number,
        token: randomBytes(6).toString("hex"),
      }))
    )
    .onConflictDoNothing()
    .returning({ id: restaurantTables.id });

  return inserted.length;
}
