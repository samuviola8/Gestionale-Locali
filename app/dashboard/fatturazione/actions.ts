"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  annullaCambioProgrammato,
  canoneDaListino,
  getContratto,
  programmaCambioPacco,
  quotaResidua,
  salvaContratto,
  segnaConguaglio,
  type ModelloContratto,
  type Periodo,
  type StatoContratto,
} from "@/lib/billing/contratti";
import { getPacchetti } from "@/lib/billing/prezzi";
import {
  applicaModuliDelPacco,
  sincronizzaAddons,
} from "@/lib/billing/addons";
import { getTenantModules } from "@/lib/modules";
import { stripeConfigurato } from "@/lib/stripe/client";
import { creaSessioneAbbonamento, urlPortale } from "@/lib/stripe/checkout";

// Il locale sceglie il suo piano.
//
// Due direzioni, due tempi diversi, e non e' una finezza:
//
//   sale  -> subito. Chi vuole le prenotazioni stasera le vuole stasera, e
//            fargliele aspettare il rinnovo vuol dire non vendergliele. La
//            differenza per i giorni che restano va in conguaglio sulla
//            prossima fattura, non regalata e non fatta pagare tutta.
//   scende -> al rinnovo. Ha gia' pagato fino a fine periodo: togliergli i
//            moduli prima sarebbe togliergli roba pagata. Fino ad allora
//            resta tutto acceso e in pagina c'e' scritto cosa cambiera'.
//
// In prova non c'e' niente da conguagliare: si sceglie e basta, ed e' il
// senso della prova — provare piani diversi prima di decidere.
export async function cambiaPiano(formData: FormData): Promise<void> {
  const session = await getSessionUser();
  if (!session || session.role !== "owner") return;

  // Fra quelli che puo' scegliere c'e' anche il suo su misura, se ce l'ha:
  // e' un pacchetto a tutti gli effetti, e una volta creato deve restare
  // raggiungibile anche dopo che e' passato a uno standard.
  const scelto = String(formData.get("pack") ?? "");
  const disponibili = await getPacchetti(session.tenantId);
  if (!disponibili.some((p) => p.key === scelto)) return;

  const contratto = await getContratto(session.tenantId);
  if (!contratto || contratto.status === "chiuso") return;

  // Un locale col servizio spento non cambia piano da solo: prima si salda.
  const [locale] = await db
    .select({ serviceBlocked: tenants.serviceBlocked })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (locale?.serviceBlocked) return;

  // Ha rimesso quello che aveva gia': via il cambio in attesa, se c'era.
  if (scelto === contratto.pack) {
    await annullaCambioProgrammato(session.tenantId);
    revalidatePath("/dashboard/fatturazione");
    return;
  }

  const nuovo = await canoneDaListino(
    scelto,
    contratto.model as ModelloContratto,
    contratto.period as Periodo,
    session.tenantId
  );
  const sale = nuovo.recurringCents > contratto.recurringCents;

  if (contratto.status === "prova" || sale) {
    if (sale && contratto.status !== "prova" && contratto.nextInvoiceAt) {
      const quota = quotaResidua(
        contratto.nextInvoiceAt,
        new Date(),
        contratto.period as Periodo
      );
      await segnaConguaglio(
        session.tenantId,
        Math.round((nuovo.recurringCents - contratto.recurringCents) * quota),
        `Passaggio a ${scelto} — differenza per i giorni che restano`
      );
    }

    await salvaContratto(session.tenantId, {
      model: contratto.model as ModelloContratto,
      pack: scelto,
      period: contratto.period as Periodo,
      recurringCents: nuovo.recurringCents,
      activationCents: contratto.activationCents,
      transactionBps: contratto.transactionBps,
      status: contratto.status as StatoContratto,
      notes: contratto.notes,
    });
    await applicaModuliDelPacco(session.tenantId, scelto);
    await sincronizzaAddons(
      session.tenantId,
      await getTenantModules(session.tenantId)
    );
  } else {
    await programmaCambioPacco(session.tenantId, scelto);
  }

  revalidatePath("/dashboard/fatturazione");
  revalidatePath("/dashboard");
}

// Con cosa paga il locale non si sceglie piu' da una tendina.
//
// C'era, e chiedeva di dichiarare "carta" e salvare prima di poter collegare
// davvero una carta: due passi per una cosa sola, e nel mezzo un contratto che
// diceva "stripe" mentre di carte non ce n'era nessuna — cioe' un dato che
// diceva il desiderio invece del fatto. Adesso il provider lo scrive chi lo
// sa: agganciaProvider dal webhook, quando l'abbonamento nasce o muore, e il
// pannello admin quando lo decido io. La dashboard mostra come stanno le cose
// e offre l'unica azione che serve: collegare la carta, o gestirla.

export type EsitoPagamento =
  | { ok: true; url: string }
  | { ok: false; errore: string };

// Il locale collega la carta, o va a gestirla se ce l'ha gia'.
//
// Torna l'indirizzo invece di andarci: un `redirect()` da una server action
// della dashboard rimbalza al login — e' lo stesso motivo per cui non c'e' in
// salvaDatiFatturazione qui sotto. A spostarsi ci pensa il bottone, che sta
// nel browser e quel problema non ce l'ha.
//
// Chi ha gia' un abbonamento non va a un secondo Checkout ma al portale di
// Stripe: la' si cambia la carta scaduta, si scaricano le ricevute e si
// disdice da soli. Mandarlo di nuovo a pagare vorrebbe dire aprirgli un
// secondo abbonamento sullo stesso locale, e accorgersene al doppio addebito.
export async function apriPagamentoCarta(): Promise<EsitoPagamento> {
  const session = await getSessionUser();
  // Il conto del locale e' del titolare: chi sta in sala per il turno non
  // mette la carta dell'azienda.
  if (!session || session.role !== "owner") {
    return { ok: false, errore: "Solo il titolare puo' collegare il pagamento." };
  }
  if (!stripeConfigurato()) {
    return {
      ok: false,
      errore: "Il pagamento con carta non e' ancora attivo. Riprova piu' tardi.",
    };
  }

  const contratto = await getContratto(session.tenantId);
  if (!contratto) {
    return { ok: false, errore: "Non c'e' ancora un contratto da pagare." };
  }

  // Si torna da dove si e' partiti, non a un indirizzo ricostruito: il locale
  // sta sul suo sottodominio, e rimandarlo al dominio radice vorrebbe dire
  // buttarlo fuori dalla sua dashboard dopo aver pagato.
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const pagina = `${proto}://${host}/dashboard/fatturazione`;

  // Nessun controllo su `serviceBlocked`, e non e' una dimenticanza: il locale
  // col servizio spento per morosita' e' esattamente quello che deve poter
  // pagare. E' scritto nello schema — quel blocco lascia entrare il titolare
  // apposta.
  try {
    const url = contratto.providerSubscriptionId
      ? await urlPortale(session.tenantId, pagina)
      : await creaSessioneAbbonamento(session.tenantId, {
          successUrl: `${pagina}?carta=collegata`,
          cancelUrl: pagina,
        });
    return { ok: true, url };
  } catch (e) {
    // Il motivo vero finisce nei log, al locale arriva una frase che puo'
    // usare: "Invalid API key" sullo schermo di un ristoratore non aiuta
    // nessuno, e dice a chi passa di li' piu' di quanto serva.
    console.error("[stripe] apertura pagamento:", e);
    return {
      ok: false,
      errore: "Non riesco ad aprire il pagamento. Riprova, o scrivimi.",
    };
  }
}

// I dati di fatturazione li scrive il locale, non io.
//
// Erano solo in /admin, ed era un giro assurdo: la partita IVA e il codice
// destinatario ce li ha lui, glieli da' il suo commercialista, e farmeli
// dettare per telefono per poi ricopiarli a mano vuol dire una cifra sbagliata
// ogni tanto e una fattura da rifare. Qui li mette una volta e li corregge da
// solo quando cambiano.
//
// Restano modificabili anche dal pannello admin: chi firma davanti a me il
// contratto me li lascia li' e non ha voglia di ricompilarli dopo.
export async function salvaDatiFatturazione(formData: FormData): Promise<void> {
  const session = await getSessionUser();
  // Il conto del locale e' del titolare: chi sta in sala per il turno non
  // scrive la ragione sociale.
  if (!session || session.role !== "owner") return;

  const testo = (k: string) => String(formData.get(k) ?? "").trim() || null;

  const [prima] = await db
    .select({
      address: tenants.address,
      city: tenants.city,
      province: tenants.province,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (!prima) return;

  const address = testo("address");
  const city = testo("city");
  const province = testo("province")?.toUpperCase() ?? null;

  // Come in /admin: cambiato l'indirizzo, le coordinate ricavate da quello
  // vecchio non valgono piu' e si azzerano, cosi' la prima ricerca di un
  // indirizzo di consegna le ricalcola invece di ordinare i risultati intorno
  // al posto di prima.
  const traslocato =
    address !== prima.address ||
    city !== prima.city ||
    province !== prima.province;

  await db
    .update(tenants)
    .set({
      legalName: testo("legalName"),
      address,
      city,
      province,
      postalCode: testo("postalCode"),
      vatNumber: testo("vatNumber"),
      taxCode: testo("taxCode")?.toUpperCase() ?? null,
      // Sette caratteri maiuscoli: lo SDI scarta la fattura se arriva scritto
      // a modo suo.
      sdiCode: testo("sdiCode")?.toUpperCase() ?? null,
      pecEmail: testo("pecEmail")?.toLowerCase() ?? null,
      billingEmail: testo("billingEmail")?.toLowerCase() ?? null,
      ...(traslocato ? { latitude: null, longitude: null } : {}),
    })
    .where(eq(tenants.id, session.tenantId));

  // Niente redirect: da una server action della dashboard rimbalzerebbe al
  // login. Si resta in pagina e si rilegge quello che si e' appena scritto.
  revalidatePath("/dashboard/fatturazione");
}
