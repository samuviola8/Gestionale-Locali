import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { invoices, tenantBilling, tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { getImpostazioni } from "@/lib/billing/impostazioni";

// Spegnere il servizio a chi non paga.
//
// Sono due interruttori diversi e devono restare diversi:
//
//   tenants.suspended       la mia mano. Chiude tutto, login compreso. Serve
//                           per il locale che ha chiuso o con cui ho finito.
//   tenants.serviceBlocked  il conto che non torna. Spegne l'ordinazione al
//                           tavolo e la dashboard operativa, ma lascia entrare
//                           il titolare: deve poter vedere cosa deve e pagarlo.
//                           Uno che non riesce nemmeno a leggere la fattura
//                           non paga piu' in fretta, chiama piu' arrabbiato.

export type MotivoBlocco = "morosita" | "prova_scaduta";

export function spiegaBlocco(motivo: string | null): string {
  if (motivo === "prova_scaduta") return "Prova finita";
  if (motivo === "morosita") return "Fattura non saldata";
  return "Servizio sospeso";
}

// Documenti emessi, mai saldati e scaduti da piu' della tolleranza. La
// tolleranza si conta dalla scadenza, non dall'emissione: quindici giorni per
// pagare piu' dieci di pazienza sono venticinque, ed e' giusto che si vedano
// come due numeri distinti invece di uno solo che non spiega niente.
export async function fattureFuoriTolleranza(
  tenantId: string,
  graceDays: number,
  quando: Date = new Date()
): Promise<number> {
  const limite = new Date(quando);
  limite.setDate(limite.getDate() - graceDays);

  const righe = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        inArray(invoices.status, ["emesso", "scaduto"]),
        isNotNull(invoices.dueAt),
        lt(invoices.dueAt, limite)
      )
    );
  return righe.length;
}

/** Ricalcola il blocco di un locale. Torna true se resta (o diventa) bloccato. */
export async function aggiornaBloccoLocale(
  tenantId: string,
  quando: Date = new Date()
): Promise<boolean> {
  const [impostazioni, contratti, locali] = await Promise.all([
    getImpostazioni(),
    db.select().from(tenantBilling).where(eq(tenantBilling.tenantId, tenantId)).limit(1),
    db
      .select({ serviceBlocked: tenants.serviceBlocked })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  ]);

  const contratto = contratti[0];
  const locale = locali[0];
  if (!locale) return false;

  let motivo: MotivoBlocco | null = null;
  let nuovoStato: string | null = null;

  if (contratto && contratto.status !== "chiuso") {
    const arretrate = await fattureFuoriTolleranza(
      tenantId,
      impostazioni.graceDays,
      quando
    );

    if (contratto.status === "sospeso") {
      // Gia' sospeso: ci resta finche' l'arretrato non rientra. Quando
      // rientra riparte da solo — chi ha pagato non deve aspettare che io me
      // ne accorga. Per tenere fuori qualcuno a prescindere c'e'
      // `tenants.suspended`, che e' un'altra cosa e la decido io.
      if (arretrate > 0) motivo = "morosita";
      else nuovoStato = "attivo";
    } else if (
      contratto.status === "prova" &&
      impostazioni.suspendExpiredTrials &&
      contratto.trialEndsAt &&
      contratto.trialEndsAt < quando
    ) {
      motivo = "prova_scaduta";
    } else if (
      contratto.status === "attivo" &&
      impostazioni.autoSuspend &&
      arretrate > 0
    ) {
      motivo = "morosita";
      nuovoStato = "sospeso";
    }
  }

  if (nuovoStato && nuovoStato !== contratto?.status) {
    await db
      .update(tenantBilling)
      .set({ status: nuovoStato, updatedAt: new Date() })
      .where(eq(tenantBilling.tenantId, tenantId));
  }

  const bloccato = motivo !== null;
  if (bloccato !== locale.serviceBlocked) {
    await db
      .update(tenants)
      .set({ serviceBlocked: bloccato, blockedReason: motivo })
      .where(eq(tenants.id, tenantId));
  } else if (bloccato) {
    await db
      .update(tenants)
      .set({ blockedReason: motivo })
      .where(eq(tenants.id, tenantId));
  }

  return bloccato;
}

/** Il giro su tutti i locali. Lo lancia la manutenzione da /admin. */
export async function applicaBlocchi(
  quando: Date = new Date()
): Promise<{ bloccati: number; liberi: number }> {
  const tutti = await db.select({ id: tenants.id }).from(tenants);
  let bloccati = 0;
  for (const t of tutti) {
    if (await aggiornaBloccoLocale(t.id, quando)) bloccati++;
  }
  return { bloccati, liberi: tutti.length - bloccati };
}

// Sblocco a mano: la telefonata in cui dice che il bonifico e' partito e io
// gli credo. Non tocca le fatture — restano da incassare — ma riaccende il
// servizio subito.
export async function sbloccaLocale(tenantId: string): Promise<void> {
  await db
    .update(tenants)
    .set({ serviceBlocked: false, blockedReason: null })
    .where(eq(tenants.id, tenantId));
  await db
    .update(tenantBilling)
    .set({ status: "attivo", updatedAt: new Date() })
    .where(
      and(eq(tenantBilling.tenantId, tenantId), eq(tenantBilling.status, "sospeso"))
    );
}

// Guardia delle pagine di lavoro della dashboard. Fuori restano il conto e il
// proprio accesso: sono le due cose che a un locale bloccato servono davvero.
export async function richiediServizio(): Promise<void> {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const righe = await db
    .select({ serviceBlocked: tenants.serviceBlocked })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  if (righe[0]?.serviceBlocked) redirect("/dashboard/sospeso");
}
