import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { supportTickets, tenants } from "@/lib/db/schema";
import type { SegnalazioneInLista } from "@/lib/segnalazioni";

// Letture e scritture delle segnalazioni. Stanno separate dal vocabolario
// perche' quello lo usa anche il pannello nella barra, che gira nel browser e
// col database non deve avere niente a che fare.

// Le ultime segnalazioni del locale, non solo le proprie: in una squadra di
// quattro persone sapere che il problema e' gia' stato scritto evita di
// scriverlo altre tre volte.
export async function ultimeDelLocale(
  tenantId: string,
  limite = 12
): Promise<SegnalazioneInLista[]> {
  return db
    .select({
      id: supportTickets.id,
      kind: supportTickets.kind,
      message: supportTickets.message,
      status: supportTickets.status,
      reply: supportTickets.reply,
      createdAt: supportTickets.createdAt,
      repliedAt: supportTickets.repliedAt,
      replySeenAt: supportTickets.replySeenAt,
      autore: supportTickets.userEmail,
    })
    .from(supportTickets)
    .where(eq(supportTickets.tenantId, tenantId))
    .orderBy(desc(supportTickets.createdAt))
    .limit(limite);
}

// Aprire il pannello vale come "letto": la risposta e' li' sotto gli occhi, e
// chiedere un secondo clic per spegnere il pallino vuol dire lasciarlo acceso
// per sempre.
export async function segnaRisposteLette(tenantId: string): Promise<void> {
  await db
    .update(supportTickets)
    .set({ replySeenAt: new Date() })
    .where(
      and(
        eq(supportTickets.tenantId, tenantId),
        isNotNull(supportTickets.reply),
        isNull(supportTickets.replySeenAt)
      )
    );
}

// --- Dalla parte di chi risponde --------------------------------------------

export type SegnalazionePerAdmin = SegnalazioneInLista & {
  tenantId: string;
  tenantName: string;
  // Il contesto raccolto dal pannello. Qui serve: e' la differenza fra
  // "non va il menu" e sapere su che pagina e con che telefono non andava.
  page: string | null;
  userAgent: string | null;
};

export type FiltroSegnalazioni = "aperte" | "risolte" | "tutte";

export async function segnalazioniPerAdmin(
  filtro: FiltroSegnalazioni = "aperte"
): Promise<SegnalazionePerAdmin[]> {
  const stati =
    filtro === "aperte"
      ? ["aperta", "presa"]
      : filtro === "risolte"
        ? ["risolta"]
        : null;

  return db
    .select({
      id: supportTickets.id,
      kind: supportTickets.kind,
      message: supportTickets.message,
      status: supportTickets.status,
      reply: supportTickets.reply,
      createdAt: supportTickets.createdAt,
      repliedAt: supportTickets.repliedAt,
      replySeenAt: supportTickets.replySeenAt,
      autore: supportTickets.userEmail,
      tenantId: supportTickets.tenantId,
      tenantName: tenants.name,
      page: supportTickets.page,
      userAgent: supportTickets.userAgent,
    })
    .from(supportTickets)
    .innerJoin(tenants, eq(tenants.id, supportTickets.tenantId))
    .where(stati ? inArray(supportTickets.status, stati) : undefined)
    .orderBy(desc(supportTickets.createdAt))
    .limit(200);
}

/** Quante aspettano ancora una risposta: il numero da tenere d'occhio. */
export async function segnalazioniAperte(): Promise<number> {
  const righe = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(inArray(supportTickets.status, ["aperta", "presa"]));
  return righe.length;
}

export async function rispondiASegnalazione(
  id: string,
  testo: string,
  stato: string
): Promise<void> {
  const risposta = testo.trim();
  await db
    .update(supportTickets)
    .set({
      status: stato,
      ...(risposta
        ? {
            reply: risposta.slice(0, 4000),
            repliedAt: new Date(),
            // Una risposta nuova riaccende il pallino nella dashboard: chi
            // aveva letto quella di ieri deve accorgersi di questa.
            replySeenAt: null,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, id));
}

/** L'indirizzo del super-admin, per il link dentro l'avviso. */
export function linkSegnalazioni(): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  // Il super-admin risponde da qualunque sottodominio: "comanda" e' quello
  // della vetrina, l'unico che c'e' di sicuro.
  const host = root.includes("localhost") ? root : `comanda.${root}`;
  return `${proto}://${host}/admin/segnalazioni`;
}
