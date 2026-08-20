import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingSettings } from "@/lib/db/schema";

// Le regole commerciali della piattaforma: durata della prova, tolleranza sui
// pagamenti, se spegnere il servizio da solo. Una riga sola a database.
//
// Non stanno in FATTURAZIONE_* con i dati fiscali perche' sono cose diverse:
// la partita IVA la scrivo una volta e non la tocco piu', la durata della
// prova la cambio dopo il terzo locale che mi chiede due settimane in piu'.

const CHIAVE = "unico";

export type Impostazioni = {
  trialDays: number;
  transactionBps: number;
  graceDays: number;
  autoSuspend: boolean;
  suspendExpiredTrials: boolean;
};

// I valori di partenza. Servono anche come rete: se la riga non c'e' ancora,
// la piattaforma funziona lo stesso invece di rompersi al primo locale.
export const IMPOSTAZIONI_DEFAULT: Impostazioni = {
  trialDays: 30,
  transactionBps: 40,
  graceDays: 10,
  // Spento di partenza: nei primi mesi chi non paga lo si chiama, non lo si
  // spegne di notte con un job.
  autoSuspend: false,
  suspendExpiredTrials: true,
};

export async function getImpostazioni(): Promise<Impostazioni> {
  const rows = await db
    .select()
    .from(billingSettings)
    .where(eq(billingSettings.id, CHIAVE))
    .limit(1);
  const r = rows[0];
  if (!r) return { ...IMPOSTAZIONI_DEFAULT };
  return {
    trialDays: r.trialDays,
    transactionBps: r.transactionBps,
    graceDays: r.graceDays,
    autoSuspend: r.autoSuspend,
    suspendExpiredTrials: r.suspendExpiredTrials,
  };
}

export async function salvaImpostazioni(dati: Impostazioni): Promise<void> {
  const values = {
    // Una prova di zero giorni non e' una prova, e una di tre anni non e' un
    // mestiere: i limiti servono a non spararsi nel piede da un campo di testo.
    trialDays: limita(dati.trialDays, 0, 365, IMPOSTAZIONI_DEFAULT.trialDays),
    transactionBps: limita(dati.transactionBps, 0, 1000, 0),
    graceDays: limita(dati.graceDays, 0, 180, IMPOSTAZIONI_DEFAULT.graceDays),
    autoSuspend: dati.autoSuspend,
    suspendExpiredTrials: dati.suspendExpiredTrials,
    updatedAt: new Date(),
  };
  await db
    .insert(billingSettings)
    .values({ id: CHIAVE, ...values })
    .onConflictDoUpdate({ target: billingSettings.id, set: values });
}

function limita(v: number, min: number, max: number, ripiego: number): number {
  if (!Number.isFinite(v)) return ripiego;
  return Math.min(max, Math.max(min, Math.round(v)));
}
