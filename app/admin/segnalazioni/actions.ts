"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { STATI } from "@/lib/segnalazioni";
import { rispondiASegnalazione } from "@/lib/segnalazioni-query";

export async function salvaRisposta(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;

  const id = String(formData.get("id") ?? "");
  const testo = String(formData.get("risposta") ?? "");
  const stato = String(formData.get("stato") ?? "");
  if (!id || !STATI.some((s) => s.key === stato)) return;

  await rispondiASegnalazione(id, testo, stato);
  revalidatePath("/admin/segnalazioni");
}
