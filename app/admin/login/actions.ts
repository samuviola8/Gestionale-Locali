"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformAdmins } from "@/lib/db/schema";
import { createAdminSession } from "@/lib/admin-auth";
import { passoCodice, passoPassword } from "@/lib/login";
import type { Metodo } from "@/lib/twofa";

export type AdminLoginState = {
  ok: boolean;
  error?: boolean;
  /** La password temporanea ricevuta per mail non vale più. */
  scaduta?: boolean;
  /** Password giusta, manca il secondo passaggio. */
  sfida?: { token: string; metodo: Metodo; avviso: string };
  /** Errore sul codice del secondo passaggio. */
  codice?: string;
  /** Il secondo fattore è via mail e la mail non è partita. */
  senzaCodice?: boolean;
};

export async function adminLogin(
  _prev: AdminLoginState,
  formData: FormData
): Promise<AdminLoginState> {
  // Secondo giro: la password è già stata data, qui arriva solo il codice.
  const token = String(formData.get("token") ?? "");
  if (token) {
    const r = await passoCodice("admin", token, String(formData.get("codice") ?? ""));
    if (r.esito === "no") {
      const metodo = (String(formData.get("metodo") ?? "totp") || "totp") as Metodo;
      return {
        ok: false,
        codice: r.messaggio,
        sfida: { token, metodo, avviso: "" },
      };
    }
    await createAdminSession(r.id);
    return { ok: true };
  }

  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");

  const [a] = await db
    .select({
      id: platformAdmins.id,
      hash: platformAdmins.passwordHash,
      mustChangePassword: platformAdmins.mustChangePassword,
      tempPasswordUntil: platformAdmins.tempPasswordUntil,
    })
    .from(platformAdmins)
    .where(eq(platformAdmins.email, email))
    .limit(1);

  const r = await passoPassword("admin", a ?? null, password);
  switch (r.esito) {
    case "credenziali":
      return { ok: false, error: true };
    case "scaduta":
      return { ok: false, scaduta: true };
    case "senza-codice":
      return { ok: false, senzaCodice: true };
    case "sfida":
      return {
        ok: false,
        sfida: { token: r.token, metodo: r.metodo, avviso: r.avviso ?? "" },
      };
    case "ok":
      await createAdminSession(r.id);
      return { ok: true };
  }
}
