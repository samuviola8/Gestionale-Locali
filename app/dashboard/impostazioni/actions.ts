"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuCategories, reparti, tenants, users } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { saveImage } from "@/lib/uploads";
import {
  leggiChiusure,
  leggiOrari,
  type Chiusura,
  type OrariApertura,
} from "@/lib/orari";
import { normalizzaImpostazioni } from "@/lib/prenotazioni";
import { mittenteLocale } from "@/lib/prenotazioni-mail";
import { inviaMailLocale, provaMailLocale } from "@/lib/mail";
import { cifra, cifraturaDisponibile } from "@/lib/segreti";
import { suonoValido } from "@/lib/suoni";

async function requireOwner(): Promise<string> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  // Chi prepara non riconfigura il locale.
  if (s.role !== "owner") redirect("/dashboard");
  return s.tenantId;
}

export async function addReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const name = String(formData.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;

  const quanti = await db
    .select({ id: reparti.id })
    .from(reparti)
    .where(eq(reparti.tenantId, tenantId));

  await db
    .insert(reparti)
    .values({ tenantId, name, sortOrder: quanti.length });
  revalidatePath("/dashboard/impostazioni");
}

export async function deleteReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const id = String(formData.get("id") ?? "");
  // Le categorie e gli account che lo puntavano tornano senza reparto invece
  // di sparire: e' quello che fa `on delete set null` a schema.
  await db
    .delete(reparti)
    .where(and(eq(reparti.id, id), eq(reparti.tenantId, tenantId)));
  revalidatePath("/dashboard/impostazioni");
}

// A quale postazione va preparata una categoria. Vuoto = coda generale.
export async function setCategoriaReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const categoriaId = String(formData.get("categoriaId") ?? "");
  const raw = String(formData.get("repartoId") ?? "");
  const repartoId = raw || null;
  if (!categoriaId) return;

  if (repartoId) {
    const suo = await db
      .select({ id: reparti.id })
      .from(reparti)
      .where(and(eq(reparti.id, repartoId), eq(reparti.tenantId, tenantId)))
      .limit(1);
    if (!suo.length) return;
  }

  await db
    .update(menuCategories)
    .set({ repartoId })
    .where(
      and(
        eq(menuCategories.id, categoriaId),
        eq(menuCategories.tenantId, tenantId)
      )
    );
  revalidatePath("/dashboard/impostazioni");
}

export async function setUtenteReparto(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const userId = String(formData.get("userId") ?? "");
  const raw = String(formData.get("repartoId") ?? "");
  const repartoId = raw || null;
  if (!userId) return;

  await db
    .update(users)
    .set({ repartoId })
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  revalidatePath("/dashboard/impostazioni");
}

// Gli orari di apertura. Da qui si ricavano le fasce di ritiro, quindi si
// ripuliscono prima di scrivere: una fascia storta a database vorrebbe dire
// proporre consegne a serranda abbassata.
export async function salvaOrari(orari: OrariApertura): Promise<void> {
  const tenantId = await requireOwner();
  await db
    .update(tenants)
    .set({ openingHours: leggiOrari(orari) })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/impostazioni");
}

// I giorni di chiusura a data fissa. Si ripuliscono prima di scrivere come si
// fa con gli orari: una data storta qui dentro non da' errore, semplicemente
// non chiude mai niente, e il locale se ne accorgerebbe con la sala piena a
// Natale.
export async function salvaChiusure(chiusure: Chiusura[]): Promise<void> {
  const tenantId = await requireOwner();
  await db
    .update(tenants)
    .set({ closureDays: leggiChiusure(chiusure) })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/impostazioni");
  revalidatePath("/dashboard/prenotazioni");
}

// Le regole della prenotazione online. Sono i numeri che decidono quanta
// gente entra in una sera: si ripuliscono prima di scrivere, perche' una
// durata a zero o un massimo sotto il minimo non renderebbero prenotabile piu'
// niente e il locale se ne accorgerebbe dai clienti che non arrivano.
export async function salvaPrenotazioni(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const numero = (k: string) => parseInt(String(formData.get(k) ?? ""), 10);

  const cfg = normalizzaImpostazioni({
    passoMinuti: numero("passo"),
    durataMinuti: numero("durata"),
    minPersone: numero("minPersone"),
    maxPersone: numero("maxPersone"),
    preavvisoMinuti: numero("preavviso"),
    giorniAvanti: numero("giorniAvanti"),
    confermaAutomatica: formData.get("confermaAutomatica") === "on",
    maxTavoliUniti: numero("maxTavoliUniti"),
    sedieExtra: numero("sedieExtra"),
    nota: String(formData.get("nota") ?? ""),
  });

  await db
    .update(tenants)
    .set({
      reservationSlotMinutes: cfg.passoMinuti,
      reservationDurationMinutes: cfg.durataMinuti,
      reservationMinParty: cfg.minPersone,
      reservationMaxParty: cfg.maxPersone,
      reservationLeadMinutes: cfg.preavvisoMinuti,
      reservationHorizonDays: cfg.giorniAvanti,
      reservationAutoConfirm: cfg.confermaAutomatica,
      reservationMaxJoin: cfg.maxTavoliUniti,
      reservationExtraSeats: cfg.sedieExtra,
      reservationNote: cfg.nota,
    })
    .where(eq(tenants.id, tenantId));

  revalidatePath("/dashboard/impostazioni");
  revalidatePath("/dashboard/prenotazioni");
}

// La casella del locale, da cui partono le conferme di prenotazione.
//
// La password e' una "password per applicazione" (Gmail, Aruba, Register: si
// genera dal pannello della casella) e non la password vera del titolare: se
// domani va cambiata, si revoca quella e basta. A database ci va cifrata, e
// senza APP_SECRET non ci va per niente — meglio dire che non si puo' fare che
// scriverla in chiaro nella tabella dei locali.
export async function salvaPosta(
  formData: FormData
): Promise<void> {
  const tenantId = await requireOwner();

  const host = String(formData.get("host") ?? "").trim().slice(0, 120);
  const user = String(formData.get("user") ?? "").trim().slice(0, 160);
  const pass = String(formData.get("pass") ?? "").trim();
  const porta = parseInt(String(formData.get("porta") ?? ""), 10);

  // Senza indirizzo la posta si spegne: e' il modo per tornare indietro.
  if (!user) {
    await db
      .update(tenants)
      .set({ smtpHost: null, smtpUser: null, smtpPass: null })
      .where(eq(tenants.id, tenantId));
    revalidatePath("/dashboard/impostazioni");
    return;
  }

  if (!cifraturaDisponibile()) return;

  await db
    .update(tenants)
    .set({
      smtpHost: host || "smtp.gmail.com",
      smtpPort: porta === 587 ? 587 : 465,
      smtpUser: user,
      // Campo lasciato vuoto = si tiene quella gia' salvata: la password non
      // torna mai in pagina, quindi un salvataggio dell'indirizzo non deve
      // cancellarla.
      ...(pass ? { smtpPass: cifra(pass) } : {}),
    })
    .where(eq(tenants.id, tenantId));

  revalidatePath("/dashboard/impostazioni");
}

export type EsitoProva = { ok: boolean; messaggio: string };

// Prova la casella davvero: si collega, si autentica e si manda una mail da
// sola. Scoprire che la password era sbagliata alla prima prenotazione vuol
// dire un cliente che aspetta una conferma che non arrivera' mai.
export async function provaPosta(): Promise<EsitoProva> {
  const tenantId = await requireOwner();
  const m = await mittenteLocale(tenantId);

  if (!m?.smtp) {
    return {
      ok: false,
      messaggio:
        "Manca qualcosa: servono indirizzo e password per applicazione, salvati qui sopra.",
    };
  }

  try {
    await provaMailLocale(m.smtp);
    await inviaMailLocale(m.smtp, {
      a: m.smtp.user,
      oggetto: `Prova di invio — ${m.nome}`,
      testo:
        "Questa mail conferma che la casella del locale può mandare le conferme di prenotazione.\n\nSe la stai leggendo, è tutto a posto.",
    });
    return {
      ok: true,
      messaggio: `Fatto: una mail di prova è appena partita verso ${m.smtp.user}.`,
    };
  } catch (e) {
    console.error("[impostazioni] prova posta fallita", e);
    return {
      ok: false,
      messaggio:
        "Il server di posta ha rifiutato: controlla indirizzo, password per applicazione e porta.",
    };
  }
}

// Come si annuncia una chiamata dal tavolo. Un suono che non esiste non si
// scrive: resta quello di prima, che almeno si sente.
// La firma in fondo al menu del cliente. La decisione e' del locale: quella
// pagina la presenta come sua.
export async function salvaMenuAlTavolo(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  await db
    .update(tenants)
    .set({ menuBranding: formData.get("marchio") === "on" })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/impostazioni");
}

export async function salvaChiamate(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const suono = String(formData.get("suono") ?? "");

  await db
    .update(tenants)
    .set({
      ...(suonoValido(suono) ? { callSound: suono } : {}),
      callBlink: formData.get("lampeggia") === "on",
    })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/impostazioni");
  // La campanella vive nel guscio della dashboard: senza questo continuerebbe
  // a suonare come prima fino al prossimo caricamento completo.
  revalidatePath("/dashboard", "layout");
}

// Gli interruttori della stampa. Arrivano tutti insieme dal form: le caselle
// non spuntate non compaiono in FormData, quindi assenza = spento.
export async function salvaStampa(formData: FormData): Promise<void> {
  const tenantId = await requireOwner();
  const on = (k: string) => formData.get(k) === "on";

  await db
    .update(tenants)
    .set({
      printComandaTavolo: on("tavolo"),
      printComandaBanco: on("banco"),
      printComandaAsporto: on("asporto"),
      printComandaDomicilio: on("domicilio"),
      printContoAllaChiusura: on("contoChiusura"),
      printScontrinoCassa: on("scontrinoCassa"),
    })
    .where(eq(tenants.id, tenantId));
  revalidatePath("/dashboard/impostazioni");
}

// Il logo del locale, cambiato da lui.
//
// Era solo in /admin, e non ha senso: il logo cambia quando il locale rifa'
// l'insegna o il grafico gli manda il file buono, e in quel momento la
// persona che ce l'ha in mano e' il titolare — non io. Compare in cima alla
// dashboard e sulla pagina che vede il cliente col QR, quindi e' roba sua.
export async function salvaLogo(formData: FormData): Promise<void> {
  const session = await getSessionUser();
  if (!session || session.role !== "owner") return;

  const [locale] = await db
    .select({ slug: tenants.slug, logoUrl: tenants.logoUrl })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (!locale) return;

  // "Togli il logo" e' una scelta, non un errore: chi non ce l'ha vede la
  // lettera iniziale del nome, che e' meglio di un file sbagliato.
  if (formData.get("togli") === "on") {
    await db
      .update(tenants)
      .set({ logoUrl: null })
      .where(eq(tenants.id, session.tenantId));
    revalidatePath("/dashboard", "layout");
    return;
  }

  const nuovo = await saveImage(formData.get("logo"), locale.slug);
  // Nessun file scelto, o formato che non va: si tiene quello di prima invece
  // di cancellarlo. Un salvataggio a vuoto non deve lasciare il locale senza.
  if (!nuovo) return;

  await db
    .update(tenants)
    .set({ logoUrl: nuovo })
    .where(eq(tenants.id, session.tenantId));

  // "layout" e non la sola pagina: il logo sta nella barra, che vive nel
  // layout — rivalidare solo Impostazioni lo lascerebbe vecchio dappertutto.
  revalidatePath("/dashboard", "layout");
}
