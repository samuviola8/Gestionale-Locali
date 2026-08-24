"use server";

import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { COOKIE_RIMANDA, salvaTestimonianza } from "@/lib/recensioni";

// La testimonianza del gestore, chiesta dalla dashboard. La firma e' il nome
// del locale perche' e' cosi' che ha senso leggerla in vetrina — «Anna,
// Trattoria da Anna» dice molto piu' di «Anna».

/** Per quanto vale il «non adesso»: due mesi, non per sempre. */
const DUE_MESI = 60 * 24 * 60 * 60;

export async function inviaTestimonianza(
  voto: number,
  testo: string,
  firma: string,
  pubblicabile: boolean
): Promise<{ ok: true } | { ok: false; errore: string }> {
  const session = await getSessionUser();
  if (!session) return { ok: false, errore: "Sessione scaduta. Rientra." };

  return salvaTestimonianza({
    tenantId: session.tenantId,
    nomeLocale: session.tenantName,
    ruolo: "gestore",
    voto,
    testo,
    firma,
    pubblicabile,
  });
}

export async function rimandaTestimonianza(): Promise<void> {
  (await cookies()).set(COOKIE_RIMANDA, "1", {
    path: "/dashboard",
    maxAge: DUE_MESI,
    httpOnly: true,
    sameSite: "lax",
  });
}
