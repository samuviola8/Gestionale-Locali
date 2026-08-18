"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import {
  cambiaEmailAdmin,
  cambiaPassword,
  confermaMail,
  confermaTotp,
  preparaMail,
  preparaTotp,
  spegniDueFattori,
  type AvvioMail,
  type AvvioTotp,
  type Esito,
} from "@/lib/account";

// L'account del gestore del servizio. Ogni azione ricontrolla la sessione: la
// pagina l'ha già fatto, ma un'azione si può chiamare anche senza passare
// dalla pagina.

const SCADUTA = "Sessione scaduta: rifai il login.";
const FUORI: Esito = { ok: false, errore: SCADUTA };

export async function cambiaPasswordAdmin(
  _prev: Esito | null,
  fd: FormData
): Promise<Esito> {
  const admin = await getAdminUser();
  if (!admin) return FUORI;

  const esito = await cambiaPassword(
    "admin",
    admin.id,
    String(fd.get("attuale") ?? ""),
    String(fd.get("nuova") ?? ""),
    String(fd.get("ripeti") ?? "")
  );
  if (esito.ok) revalidatePath("/admin/account");
  return esito;
}

export async function cambiaEmail(
  _prev: Esito | null,
  fd: FormData
): Promise<Esito> {
  const admin = await getAdminUser();
  if (!admin) return FUORI;

  const esito = await cambiaEmailAdmin(
    admin.id,
    String(fd.get("email") ?? ""),
    String(fd.get("password") ?? "")
  );
  if (esito.ok) revalidatePath("/admin/account");
  return esito;
}

export async function preparaAppAdmin(): Promise<AvvioTotp> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, errore: SCADUTA };
  return preparaTotp("admin", admin.id);
}

export async function confermaAppAdmin(codice: string): Promise<Esito> {
  const admin = await getAdminUser();
  if (!admin) return FUORI;
  return confermaTotp("admin", admin.id, codice);
}

export async function preparaPostaAdmin(): Promise<AvvioMail> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, errore: SCADUTA };
  return preparaMail("admin", admin.id);
}

export async function confermaPostaAdmin(
  token: string,
  codice: string
): Promise<Esito> {
  const admin = await getAdminUser();
  if (!admin) return FUORI;
  return confermaMail("admin", admin.id, token, codice);
}

export async function spegniAdmin(): Promise<Esito> {
  const admin = await getAdminUser();
  if (!admin) return FUORI;
  return spegniDueFattori("admin", admin.id);
}
