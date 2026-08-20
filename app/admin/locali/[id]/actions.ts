"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenantBilling, tenants, users } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { azzeraDueFattori, resettaPassword } from "@/lib/account";
import { GIORNI_PASSWORD_TEMPORANEA } from "@/lib/auth";
import {
  MODULES,
  getTenantModules,
  setTenantModules,
  type ModuleKey,
} from "@/lib/modules";
import { getPreset } from "@/lib/themes";
import { chiaveSkin } from "@/lib/skins";
import { isValidTheme, safeColor } from "@/lib/branding";
import { verificaIndirizzoWeb } from "@/lib/onboarding";
import { saveImage } from "@/lib/uploads";
import {
  getContratto,
  impostaProva,
  isModello,
  isPeriodo,
  isProvider,
  isStato,
  salvaContratto,
} from "@/lib/billing/contratti";
import { sincronizzaAddons } from "@/lib/billing/addons";
import { PACCHETTI } from "@/lib/billing/listino";
import {
  CHIAVE_SU_MISURA,
  eliminaSuMisura,
  salvaSuMisura,
} from "@/lib/billing/sumisura";
import {
  azzeraScostamenti,
  salvaPrezzoModulo,
  salvaPrezzoPacco,
} from "@/lib/billing/prezzi";
import { caricaFile, eliminaFile, spostaArchivio } from "@/lib/billing/archivio";
import { aggiornaBloccoLocale, sbloccaLocale } from "@/lib/billing/blocco";

// L'anagrafica del locale, correggibile dopo averla inserita.
//
// Sono dati che al momento della firma nessuno ha davanti per intero: la
// partita IVA arriva dal commercialista, il referente cambia, il locale
// trasloca. Se si potessero scrivere solo in creazione, l'unico modo di
// correggere una via sbagliata sarebbe rifare il locale da capo — e con lui
// menu, tavoli e QR gia' stampati.
export async function saveAnagrafica(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const testo = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();

  const [prima] = await db
    .select({
      address: tenants.address,
      city: tenants.city,
      province: tenants.province,
    })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!prima) return;

  const address = testo("address");
  const city = testo("city");
  const province = testo("province")?.toUpperCase() ?? null;

  // Le coordinate erano state ricavate dall'indirizzo di prima: cambiato
  // quello, non valgono piu'. Azzerarle le fa ricalcolare alla prima ricerca
  // di un indirizzo di consegna, invece di ordinare i risultati intorno al
  // vecchio locale.
  const traslocato =
    address !== prima.address ||
    city !== prima.city ||
    province !== prima.province;

  await db
    .update(tenants)
    .set({
      // Il nome vuoto non si salva: e' come si chiama il locale dappertutto,
      // e una scheda senza titolo non si ritrova nell'elenco.
      ...(name ? { name } : {}),
      legalName: testo("legalName"),
      address,
      city,
      province,
      postalCode: testo("postalCode"),
      phone: testo("phone"),
      contactName: testo("contactName"),
      contactEmail: testo("contactEmail")?.toLowerCase() ?? null,
      notes: testo("notes"),
      ...(traslocato ? { latitude: null, longitude: null } : {}),
    })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
  revalidatePath("/admin");
}

export type EsitoIndirizzoWeb = { errore?: string; fatto?: string };

// Il sottodominio del locale. Si cambia di rado ma si deve poter cambiare: un
// refuso nel nome resta scritto nell'indirizzo che il cliente legge sotto il
// QR, e rifare il locale per una lettera non e' una risposta.
//
// Cambiarlo manda fuori uso i QR gia' stampati e i link gia' mandati: chi
// arriva sul vecchio indirizzo non trova piu' niente. Per questo il pannello
// lo chiede due volte prima di salvare.
export async function cambiaIndirizzoWeb(
  _prev: EsitoIndirizzoWeb,
  formData: FormData
): Promise<EsitoIndirizzoWeb> {
  const admin = await getAdminUser();
  if (!admin) return { errore: "Sessione scaduta: rifai il login." };
  const id = String(formData.get("id") ?? "");
  if (!id) return { errore: "Locale non trovato." };

  const esito = await verificaIndirizzoWeb(String(formData.get("slug") ?? ""), id);
  if (!esito.ok) return { errore: esito.error };

  const [prima] = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!prima) return { errore: "Locale non trovato." };
  if (prima.slug === esito.slug) return { fatto: esito.slug };

  // I documenti caricati stanno in una cartella intestata allo slug: si
  // spostano prima, cosi' se il disco fa storie il locale resta dov'era e i
  // file si trovano ancora.
  await spostaArchivio(prima.slug, esito.slug);
  await db.update(tenants).set({ slug: esito.slug }).where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
  revalidatePath("/admin");
  return { fatto: esito.slug };
}

export async function toggleSuspend(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const cur = (
    await db
      .select({ suspended: tenants.suspended })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1)
  )[0];
  if (!cur) return;
  await db.update(tenants).set({ suspended: !cur.suspended }).where(eq(tenants.id, id));
  revalidatePath(`/admin/locali/${id}`);
}

// Cosa ha acceso il locale e quanto lo paga: un salvataggio solo.
//
// Erano due elenchi degli stessi moduli, e due elenchi degli stessi moduli
// prima o poi si contraddicono: modulo acceso e prezzo mai messo vuol dire
// regalato, prezzo messo e modulo spento vuol dire fatturato e non consegnato.
// Nessuno dei due stati e' rappresentabile passando di qui.
export async function saveModules(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const state: Partial<Record<ModuleKey, boolean>> = {};
  for (const m of MODULES) state[m.key] = formData.get(`modulo_${m.key}`) === "on";

  // Le caselle dei prezzi compilate adesso. Quelle assenti non finiscono qui
  // dentro: il modulo appena acceso senza toccarne il prezzo deve prendere
  // quello concordato o quello di listino, non zero.
  const prezzi: Partial<Record<ModuleKey, number>> = {};
  for (const m of MODULES) {
    const scritto = formData.get(`prezzo_${m.key}`);
    if (scritto !== null) prezzi[m.key] = euroToCents(String(scritto));
  }

  await setTenantModules(id, state);
  await sincronizzaAddons(id, state, prezzi);

  revalidatePath(`/admin/locali/${id}`);
  revalidatePath("/admin/fatturazione");
}

// 2,00 / "2.5" / "2" -> centesimi. Vuoto o non numerico = nessun coperto.
function euroToCents(v: string): number {
  const n = parseFloat(v.replace(",", ".").replace(/[^0-9.]/g, ""));
  return Number.isNaN(n) || n < 0 ? 0 : Math.round(n * 100);
}

export async function saveService(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const minutes = parseInt(String(formData.get("tableSessionMinutes") ?? ""), 10);

  await db
    .update(tenants)
    .set({
      coverChargeCents: euroToCents(String(formData.get("coverCharge") ?? "")),
      tableSessionMinutes:
        Number.isInteger(minutes) && minutes >= 15 && minutes <= 1440
          ? minutes
          : 120,
    })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
}

export async function saveBranding(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const defaultTheme = String(formData.get("defaultTheme") ?? "");

  // Il logo va nella cartella del locale, e qui abbiamo solo il suo id.
  const locale = await db
    .select({ slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!locale[0]) return;
  const logoUrl = await saveImage(formData.get("logo"), locale[0].slug);

  await db
    .update(tenants)
    .set({
      themePreset: getPreset(String(formData.get("themePreset") ?? "")).key,
      menuSkin: chiaveSkin(String(formData.get("menuSkin") ?? "")),
      menuBranding: formData.get("menuBranding") === "on",
      defaultTheme: isValidTheme(defaultTheme) ? defaultTheme : "system",
      brandColor: safeColor(String(formData.get("brandColor") ?? "")),
      brandAccent: safeColor(String(formData.get("brandAccent") ?? "")),
      // Nessun file caricato: si tiene il logo attuale.
      ...(logoUrl ? { logoUrl } : {}),
    })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
}

/** Il locale obbliga i suoi account alla verifica in due passaggi. Chi non ce
 *  l'ha se la configura al primo accesso: la dashboard non si apre prima. */
export async function toggleDueFattori(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const [cur] = await db
    .select({ v: tenants.twofaRequired })
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);
  if (!cur) return;
  await db
    .update(tenants)
    .set({ twofaRequired: !cur.v })
    .where(eq(tenants.id, id));
  revalidatePath(`/admin/locali/${id}`);
}

export type EsitoAccesso = {
  ok: boolean;
  messaggio: string;
  /** La password temporanea, quando la si mostra invece di mandarla. */
  password?: string;
};

/** Reset della password di un account del locale. È la risposta alla domanda
 *  "e se il titolare perde la password": la rimette il gestore del servizio,
 *  e la nuova arriva per mail — o si detta al telefono, quando la posta non
 *  c'è. */
export async function resettaAccesso(
  userId: string,
  invia: boolean
): Promise<EsitoAccesso> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, messaggio: "Sessione scaduta." };

  const [u] = await db
    .select({ id: users.id, email: users.email, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return { ok: false, messaggio: "Account non trovato." };

  const r = await resettaPassword("user", u.id, invia);
  if (!r.ok) return { ok: false, messaggio: r.errore ?? "Reset non riuscito." };

  revalidatePath(`/admin/locali/${u.tenantId}`);

  if (!invia) {
    return {
      ok: true,
      messaggio: `Password temporanea per ${u.email}, valida ${GIORNI_PASSWORD_TEMPORANEA} giorni. Dettagliela e falla cambiare al primo accesso.`,
      password: r.password,
    };
  }
  if (r.mail === "inviata")
    return { ok: true, messaggio: `Password temporanea mandata a ${u.email}.` };

  // La password è già cambiata: tacere qui vorrebbe dire lasciare fuori il
  // titolare senza che nessuno lo sappia.
  return {
    ok: false,
    messaggio:
      r.mail === "senza-posta"
        ? "Password cambiata, ma non c'è nessuna casella configurata per mandarla: eccola, dettagliela."
        : "Password cambiata, ma la mail non è partita: eccola, dettagliela.",
    password: r.password,
  };
}

/** Il titolare che ha perso il telefono con l'app di autenticazione. */
export async function azzeraAccessoDueFattori(
  userId: string
): Promise<EsitoAccesso> {
  const admin = await getAdminUser();
  if (!admin) return { ok: false, messaggio: "Sessione scaduta." };

  const [u] = await db
    .select({ id: users.id, email: users.email, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return { ok: false, messaggio: "Account non trovato." };

  await azzeraDueFattori("user", u.id);
  revalidatePath(`/admin/locali/${u.tenantId}`);
  return { ok: true, messaggio: `${u.email} può rifare la verifica da capo.` };
}

export async function deleteLocale(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await db.delete(tenants).where(eq(tenants.id, id));
  redirect("/admin");
}

// I dati che servono a intestargli una fattura. Si chiedono quando si firma,
// non all'onboarding: un locale in prova non deve compilare la partita IVA
// per provare il QR.
export async function saveDatiFiscali(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const testo = (k: string) => String(formData.get(k) ?? "").trim() || null;

  await db
    .update(tenants)
    .set({
      vatNumber: testo("vatNumber"),
      taxCode: testo("taxCode"),
      // Il codice destinatario e' sempre di sette caratteri e maiuscolo: lo
      // SDI scarta la fattura se arriva scritto a modo suo.
      sdiCode: testo("sdiCode")?.toUpperCase() ?? null,
      pecEmail: testo("pecEmail")?.toLowerCase() ?? null,
      billingEmail: testo("billingEmail")?.toLowerCase() ?? null,
    })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
}

export async function saveContratto(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const model = String(formData.get("model") ?? "abbonamento");
  const period = String(formData.get("period") ?? "mensile");
  const status = String(formData.get("status") ?? "prova");

  // La percentuale sul transato si scrive in percento perche' e' come la si
  // dice in trattativa; a database sta in punti base, che sono interi e non
  // perdono un decimale per strada.
  const percentuale = parseFloat(
    String(formData.get("transactionPct") ?? "0").replace(",", ".")
  );

  await salvaContratto(id, {
    model: isModello(model) ? model : "abbonamento",
    pack: String(formData.get("pack") ?? "sala"),
    period: isPeriodo(period) ? period : "mensile",
    recurringCents: euroToCents(String(formData.get("recurring") ?? "")),
    activationCents: euroToCents(String(formData.get("activation") ?? "")),
    transactionBps: Number.isNaN(percentuale)
      ? 0
      : Math.max(0, Math.round(percentuale * 100)),
    status: isStato(status) ? status : "prova",
    // provider non si tocca: lo sceglie il locale dalla sua dashboard.
    notes: String(formData.get("notes") ?? "").trim() || null,
  });

  // Cambiare pacchetto cambia cosa e' compreso: chi ci entra smette di essere
  // un add-on. Senza questo passaggio, scendere da Tutto a Sala lascerebbe la
  // consegna a domicilio accesa e non fatturata.
  //
  // Chi esce dal pacchetto torna a essere un add-on al prezzo di listino: il
  // prezzo concordato prima non si puo' ripescare, perche' quando era compreso
  // nel canone non esisteva piu' come riga. Il pannello lo mostra prima di
  // salvare, quindi si corregge li'.
  await sincronizzaAddons(id, await getTenantModules(id));

  revalidatePath(`/admin/locali/${id}`);
  revalidatePath("/admin/fatturazione");
}

// Prova gratuita: darla, allungarla, ridarla a chi era gia' scaduto. Si conta
// sempre da oggi, cosi' "altri quindici giorni" vuol dire quindici giorni veri
// anche se la prova era finita tre settimane fa.
export async function impostaProvaAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const giorni = parseInt(String(formData.get("giorni") ?? ""), 10);
  if (!id || !Number.isInteger(giorni) || giorni < 1) return;

  await impostaProva(id, giorni);
  // La prova nuova toglie di mezzo il blocco da prova scaduta.
  await aggiornaBloccoLocale(id);

  revalidatePath(`/admin/locali/${id}`);
  revalidatePath("/admin/fatturazione");
}

// Riaccendere a mano: la telefonata in cui dice che il bonifico e' partito.
export async function sbloccaAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await sbloccaLocale(id);
  revalidatePath(`/admin/locali/${id}`);
  revalidatePath("/admin/fatturazione");
}

// Spegnere a mano, senza aspettare la tolleranza: serve quando il blocco
// automatico e' spento e uno smette di rispondere.
export async function bloccaAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db
    .update(tenantBilling)
    .set({ status: "sospeso", updatedAt: new Date() })
    .where(eq(tenantBilling.tenantId, id));
  await db
    .update(tenants)
    .set({ serviceBlocked: true, blockedReason: "morosita" })
    .where(eq(tenants.id, id));

  revalidatePath(`/admin/locali/${id}`);
  revalidatePath("/admin/fatturazione");
}

// Caricare un documento per il locale: il contratto firmato, un preventivo,
// una visura. L'esito torna nell'indirizzo perche' un caricamento che fallisce
// in silenzio si scopre il giorno che quel contratto serve.
export async function caricaFileAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const locale = (
    await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, id)).limit(1)
  )[0];
  if (!locale) return;

  const esito = await caricaFile({
    tenantId: id,
    slugLocale: locale.slug,
    file: formData.get("file"),
    kind: String(formData.get("kind") ?? "documento"),
    title: String(formData.get("title") ?? ""),
    visibleToTenant: formData.get("visibleToTenant") === "on",
    notes: String(formData.get("notes") ?? ""),
  });

  revalidatePath(`/admin/locali/${id}`);
  if (!esito.ok) {
    redirect(`/admin/locali/${id}?file=${encodeURIComponent(esito.errore)}`);
  }
}

export async function eliminaFileAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  if (!id || !fileId) return;

  const locale = (
    await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, id)).limit(1)
  )[0];
  if (!locale) return;

  await eliminaFile(fileId, locale.slug);
  revalidatePath(`/admin/locali/${id}`);
}

// I prezzi di questo locale: quelli che vede lui quando sceglie il piano.
//
// Non e' lo stesso listino per tutti — quello sta in /admin/fatturazione/
// listino. Qui si scrive "per questo, Sala costa 39": e' la trattativa, ed e'
// il motivo per cui il locale puo' scegliere da solo senza che io debba
// rifargli il prezzo al telefono ogni volta.
export async function salvaPrezziLocaleAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  for (const p of PACCHETTI) {
    await salvaPrezzoPacco(
      p.key,
      {
        mensileCents: euroToCents(String(formData.get(`p_${p.key}_mensile`) ?? "")),
        annualeCents: euroToCents(String(formData.get(`p_${p.key}_annuale`) ?? "")),
        attivazioneCents: euroToCents(
          String(formData.get(`p_${p.key}_attivazione`) ?? "")
        ),
        assistenzaCents: euroToCents(
          String(formData.get(`p_${p.key}_assistenza`) ?? "")
        ),
      },
      id
    );
  }

  for (const m of MODULES) {
    const valore = formData.get(`m_${m.key}`);
    if (valore === null) continue;
    await salvaPrezzoModulo(m.key, euroToCents(String(valore)), id);
  }

  revalidatePath(`/admin/locali/${id}`);
}

// Torna al listino di tutti, cancellando gli scostamenti di questo locale.
export async function azzeraPrezziLocaleAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await azzeraScostamenti(id);
  revalidatePath(`/admin/locali/${id}`);
}

// Il pacchetto su misura di questo locale: quello che i tre standard non sanno
// dire. Una volta salvato compare accanto agli altri nella sua pagina
// Abbonamento, e ci resta anche se nel frattempo passa a uno standard.
export async function salvaSuMisuraAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const moduli = MODULES.filter(
    (m) => formData.get(`sm_${m.key}`) === "on"
  ).map((m) => m.key);

  await salvaSuMisura(id, {
    label: String(formData.get("sm_label") ?? ""),
    descrizione: String(formData.get("sm_descrizione") ?? ""),
    moduli,
    mensileCents: euroToCents(String(formData.get("sm_mensile") ?? "")),
    annualeCents: euroToCents(String(formData.get("sm_annuale") ?? "")),
    attivazioneCents: euroToCents(String(formData.get("sm_attivazione") ?? "")),
    assistenzaCents: euroToCents(String(formData.get("sm_assistenza") ?? "")),
  });

  revalidatePath(`/admin/locali/${id}`);
}

// Toglierlo e' un'altra cosa dal non usarlo: finche' esiste il locale puo'
// sempre tornarci. Se lo sta usando adesso, il contratto resterebbe agganciato
// a un pacchetto che non c'e' piu' — quindi prima lo si sposta, poi si toglie.
export async function eliminaSuMisuraAction(formData: FormData): Promise<void> {
  const admin = await getAdminUser();
  if (!admin) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const contratto = await getContratto(id);
  if (contratto?.pack === CHIAVE_SU_MISURA) return;

  await eliminaSuMisura(id);
  revalidatePath(`/admin/locali/${id}`);
}
