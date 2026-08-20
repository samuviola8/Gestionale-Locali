"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import {
  annullaDocumento,
  creaDocumento,
  eliminaBozza,
  emettiDocumento,
  isMetodo,
  preparaRinnovi,
  registraIncasso,
  segnaScaduti,
  type RigaNuova,
} from "@/lib/billing/documenti";
import { MODULES } from "@/lib/modules";
import { PACCHETTI } from "@/lib/billing/listino";
import { azzeraScostamenti, salvaPrezzoModulo, salvaPrezzoPacco } from "@/lib/billing/prezzi";
import { salvaImpostazioni } from "@/lib/billing/impostazioni";
import { applicaBlocchi } from "@/lib/billing/blocco";

// 49 / "49,00" / "€ 49" -> centesimi.
function euroToCents(v: string): number {
  const n = parseFloat(v.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

// Il giro delle scadenze: prepara le bozze e gira a "scaduto" quello che non
// e' rientrato. Sta dietro un bottone e non dietro un cron perche' finche' i
// locali sono venti voglio vedere cosa sto per mandare prima che parta.
export async function preparaRinnoviAction(): Promise<void> {
  if (!(await getAdminUser())) return;
  await preparaRinnovi();
  await segnaScaduti();
  // E subito dopo chi va spento e chi va riacceso: sono lo stesso giro, e
  // separarli vorrebbe dire ricordarsi di premere due bottoni.
  await applicaBlocchi();
  revalidatePath("/admin/fatturazione");
}

export async function emettiAction(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await emettiDocumento(id);
  revalidatePath("/admin/fatturazione");
  revalidatePath(`/admin/fatturazione/${id}`);
}

export async function incassoAction(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const id = String(formData.get("id") ?? "");
  const tenantId = String(formData.get("tenantId") ?? "");
  const metodo = String(formData.get("method") ?? "bonifico");
  const importo = euroToCents(String(formData.get("amount") ?? ""));
  if (!id || !tenantId || !importo) return;

  await registraIncasso({
    tenantId,
    invoiceId: id,
    amountCents: importo,
    method: isMetodo(metodo) ? metodo : "altro",
    providerRef: String(formData.get("providerRef") ?? "").trim() || null,
  });
  revalidatePath("/admin/fatturazione");
  revalidatePath(`/admin/fatturazione/${id}`);
}

export async function annullaAction(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await annullaDocumento(id);
  revalidatePath("/admin/fatturazione");
  revalidatePath(`/admin/fatturazione/${id}`);
}

export async function eliminaBozzaAction(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await eliminaBozza(id);
  revalidatePath("/admin/fatturazione");
}

// Documento scritto a mano: il rimborso, la consulenza, il modulo venduto
// fuori pacchetto. Tre righe bastano — quello che serve piu' spesso e' una
// riga sola, e un editor di righe infinite qui non se lo merita nessuno.
export async function nuovoDocumentoAction(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;
  const tenantId = String(formData.get("tenantId") ?? "");
  if (!tenantId) return;

  const righe: RigaNuova[] = [];
  for (let i = 0; i < 3; i++) {
    const descrizione = String(formData.get(`descrizione_${i}`) ?? "").trim();
    const importo = euroToCents(String(formData.get(`importo_${i}`) ?? ""));
    if (descrizione && importo) {
      righe.push({ kind: "modulo", description: descrizione, unitCents: importo });
    }
  }
  if (!righe.length) return;

  await creaDocumento(tenantId, {
    kind: String(formData.get("kind") ?? "fattura") === "proforma" ? "proforma" : "fattura",
    righe,
  });
  revalidatePath("/admin/fatturazione");
}

export async function salvaImpostazioniAction(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;

  const intero = (k: string) => parseInt(String(formData.get(k) ?? ""), 10);
  const percentuale = parseFloat(
    String(formData.get("transactionPct") ?? "0").replace(",", ".")
  );

  await salvaImpostazioni({
    trialDays: intero("trialDays"),
    transactionBps: Number.isNaN(percentuale) ? 0 : Math.round(percentuale * 100),
    graceDays: intero("graceDays"),
    autoSuspend: formData.get("autoSuspend") === "on",
    suspendExpiredTrials: formData.get("suspendExpiredTrials") === "on",
  });

  // Cambiare la tolleranza o accendere il blocco automatico deve avere effetto
  // subito: chi era gia' fuori tolleranza si spegne adesso, non al prossimo
  // giro che magari faccio fra tre giorni.
  await applicaBlocchi();

  revalidatePath("/admin/fatturazione/listino");
  revalidatePath("/admin/fatturazione");
}

export async function salvaListinoAction(formData: FormData): Promise<void> {
  if (!(await getAdminUser())) return;

  for (const p of PACCHETTI) {
    await salvaPrezzoPacco(p.key, {
      mensileCents: euroToCents(String(formData.get(`pacco_${p.key}_mensile`) ?? "")),
      annualeCents: euroToCents(String(formData.get(`pacco_${p.key}_annuale`) ?? "")),
      attivazioneCents: euroToCents(
        String(formData.get(`pacco_${p.key}_attivazione`) ?? "")
      ),
      assistenzaCents: euroToCents(
        String(formData.get(`pacco_${p.key}_assistenza`) ?? "")
      ),
    });
  }

  for (const m of MODULES) {
    const valore = formData.get(`modulo_${m.key}`);
    if (valore === null) continue;
    await salvaPrezzoModulo(m.key, euroToCents(String(valore)));
  }

  revalidatePath("/admin/fatturazione/listino");
}

// Rimette tutto ai prezzi scritti nel codice, cancellando gli scostamenti.
export async function azzeraListinoAction(): Promise<void> {
  if (!(await getAdminUser())) return;
  await azzeraScostamenti();
  revalidatePath("/admin/fatturazione/listino");
}
