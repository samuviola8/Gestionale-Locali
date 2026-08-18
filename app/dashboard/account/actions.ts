"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import {
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

// L'account di chi lavora nel locale: titolare, staff, reparti. Le stesse
// azioni servono la pagina normale e quella del primo accesso — è lo stesso
// gesto, cambia solo il momento in cui lo si fa.
//
// Nessun redirect qui dentro: da un'azione della dashboard rimanda al login
// invece che alla pagina, e chi ha appena cambiato password si ritroverebbe
// sbattuto fuori senza capire perché.

const SCADUTA = "Sessione scaduta: rifai l'accesso.";

export async function cambiaPasswordUtente(
  _prev: Esito | null,
  fd: FormData
): Promise<Esito> {
  const s = await getSessionUser();
  if (!s) return { ok: false, errore: SCADUTA };

  const esito = await cambiaPassword(
    "user",
    s.userId,
    String(fd.get("attuale") ?? ""),
    String(fd.get("nuova") ?? ""),
    String(fd.get("ripeti") ?? "")
  );
  if (esito.ok) {
    revalidatePath("/dashboard/account");
    revalidatePath("/primo-accesso");
  }
  return esito;
}

export async function preparaApp(): Promise<AvvioTotp> {
  const s = await getSessionUser();
  if (!s) return { ok: false, errore: SCADUTA };
  return preparaTotp("user", s.userId);
}

export async function confermaApp(codice: string): Promise<Esito> {
  const s = await getSessionUser();
  if (!s) return { ok: false, errore: SCADUTA };
  const esito = await confermaTotp("user", s.userId, codice);
  if (esito.ok) revalidatePath("/dashboard/account");
  return esito;
}

export async function preparaPosta(): Promise<AvvioMail> {
  const s = await getSessionUser();
  if (!s) return { ok: false, errore: SCADUTA };
  return preparaMail("user", s.userId);
}

export async function confermaPosta(
  token: string,
  codice: string
): Promise<Esito> {
  const s = await getSessionUser();
  if (!s) return { ok: false, errore: SCADUTA };
  const esito = await confermaMail("user", s.userId, token, codice);
  if (esito.ok) revalidatePath("/dashboard/account");
  return esito;
}

export async function spegni(): Promise<Esito> {
  const s = await getSessionUser();
  if (!s) return { ok: false, errore: SCADUTA };
  const esito = await spegniDueFattori("user", s.userId);
  if (esito.ok) revalidatePath("/dashboard/account");
  return esito;
}
