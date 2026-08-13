"use server";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { printJobs } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

// Il lavoro si segna fatto solo dopo che il dispositivo ha davvero stampato:
// segnarlo prima vorrebbe dire perdere la comanda se la finestra di stampa
// viene annullata.
export async function segnaStampati(ids: string[]): Promise<void> {
  const session = await getSessionUser();
  if (!session || !ids.length) return;

  await db
    .update(printJobs)
    .set({ printedAt: new Date() })
    .where(
      and(
        eq(printJobs.tenantId, session.tenantId),
        inArray(printJobs.id, ids)
      )
    );
}
