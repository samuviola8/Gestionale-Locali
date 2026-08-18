"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { supportTickets } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { avvisa } from "@/lib/avvisi";
import {
  LUNGHEZZA_MAX,
  LUNGHEZZA_MIN,
  TIPI,
  etichettaTipo,
} from "@/lib/segnalazioni";
import { linkSegnalazioni, segnaRisposteLette } from "@/lib/segnalazioni-query";

export type EsitoSegnalazione = { ok: boolean; messaggio: string };

export async function inviaSegnalazione(dati: {
  tipo: string;
  testo: string;
  pagina: string;
  browser: string;
}): Promise<EsitoSegnalazione> {
  const session = await getSessionUser();
  if (!session) {
    return { ok: false, messaggio: "Sessione scaduta: rientra e riprova." };
  }

  const testo = dati.testo.trim();
  if (testo.length < LUNGHEZZA_MIN) {
    return { ok: false, messaggio: "Scrivi due parole su cosa e' successo." };
  }

  const tipo = TIPI.some((t) => t.key === dati.tipo) ? dati.tipo : "fastidio";

  const [riga] = await db
    .insert(supportTickets)
    .values({
      tenantId: session.tenantId,
      userId: session.userId,
      userEmail: session.email,
      kind: tipo,
      message: testo.slice(0, LUNGHEZZA_MAX),
      // Il contesto arriva dal browser di chi segnala e non e' da fidarsi:
      // finisce solo in lettura, tagliato, e mai in una intestazione.
      page: dati.pagina.slice(0, 200) || null,
      userAgent: dati.browser.slice(0, 300) || null,
    })
    .returning({ id: supportTickets.id });

  // La segnalazione e' salvata: da qui in poi niente puo' piu' farla perdere.
  // L'avviso e' un di piu' che serve a me per accorgermene subito, e se non
  // parte lo staff non deve vedersi tornare indietro un errore.
  await avvisa({
    titolo: `Comanda · ${etichettaTipo(tipo)} — ${session.tenantName}`,
    righe: [
      testo,
      "",
      `Chi: ${session.email}`,
      dati.pagina ? `Dove: ${dati.pagina}` : "",
      `Segnalazione: ${riga?.id ?? "?"}`,
    ].filter(Boolean),
    link: linkSegnalazioni(),
  });

  // Niente redirect: la barra sta dentro il layout della dashboard, e
  // rimandare da qui vorrebbe dire far rimbalzare lo staff al login.
  revalidatePath("/dashboard", "layout");

  return {
    ok: true,
    messaggio: "Ricevuta. Ti rispondo qui dentro appena l'ho guardata.",
  };
}

/** Il pannello si e' aperto: le risposte in elenco sono state viste. */
export async function segnaRisposteViste(): Promise<void> {
  const session = await getSessionUser();
  if (!session) return;
  await segnaRisposteLette(session.tenantId);
  revalidatePath("/dashboard", "layout");
}
