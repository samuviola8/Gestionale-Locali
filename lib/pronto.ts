import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuProducts, restaurantTables, tenants } from "@/lib/db/schema";
import { leggiOrari } from "@/lib/orari";
import { decifra } from "@/lib/segreti";
import type { ModuleState } from "@/lib/modules";

// Quello che e' acceso ma non funziona.
//
// E' un'altra cosa dalla checklist di avvio in lib/avvio.ts. Quella accompagna
// il locale nuovo e sparisce da sola quando ha finito. Questi sono guasti di
// configurazione, e possono nascere in qualsiasi momento: uno accende la
// prenotazione web a marzo, sei mesi dopo il primo cliente, e da quel giorno
// nessuna conferma parte piu' — senza che nessuno se ne accorga finche' non
// arriva la telefonata di uno che si presenta e il tavolo non c'e'.
//
// La regola e' una sola: si segnala solo quello che il locale ha acceso. Un
// avviso sulla posta a chi non usa le prenotazioni e' rumore, e il rumore
// insegna a non guardare gli avvisi.

export type Gravita = "rotto" | "attenzione";

export type Problema = {
  chiave: string;
  gravita: Gravita;
  titolo: string;
  /** La conseguenza, detta al cliente: cosa succede davvero adesso. */
  effetto: string;
  /** Cosa si fa per sistemarlo. */
  rimedio: string;
  href: string;
  azione: string;
};

export async function problemiDelLocale(
  tenantId: string,
  modules: ModuleState
): Promise<Problema[]> {
  const uno = { n: count() };
  const [[locale], [prodotti], [tavoli], [prenotabili]] = await Promise.all([
    db
      .select({
        smtpHost: tenants.smtpHost,
        smtpUser: tenants.smtpUser,
        smtpPass: tenants.smtpPass,
        openingHours: tenants.openingHours,
        address: tenants.address,
        city: tenants.city,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
    db.select(uno).from(menuProducts).where(eq(menuProducts.tenantId, tenantId)),
    db
      .select(uno)
      .from(restaurantTables)
      .where(eq(restaurantTables.tenantId, tenantId)),
    db
      .select(uno)
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.tenantId, tenantId),
          eq(restaurantTables.bookable, true)
        )
      ),
  ]);
  if (!locale) return [];

  const problemi: Problema[] = [];

  // La posta serve solo a chi manda mail ai clienti. Oggi e' la prenotazione
  // web: la conferma, lo spostamento, la disdetta.
  //
  // `decifra` e non il solo campo pieno: la password sta cifrata, e se manca
  // APP_SECRET torna null. In quel caso la casella risulta configurata nel
  // pannello ma non parte niente lo stesso — che e' il modo peggiore di essere
  // rotti, perche' sembra tutto a posto.
  const postaPronta = !!(
    locale.smtpHost &&
    locale.smtpUser &&
    decifra(locale.smtpPass)
  );

  if (modules.reservations && !postaPronta) {
    problemi.push({
      chiave: "posta-prenotazioni",
      gravita: "rotto",
      titolo: "Le mail ai clienti non partono",
      effetto:
        "La prenotazione web e' accesa, ma non c'e' nessuna casella di posta configurata: chi prenota dal sito non riceve nessuna conferma, e non gli arriva niente nemmeno se sposti o disdici la sua prenotazione. Le prenotazioni le vedi lo stesso in agenda — e' il cliente che resta senza risposta.",
      rimedio: "Configura la casella del locale in Impostazioni → Posta.",
      href: "/dashboard/impostazioni",
      azione: "Configura la posta",
    });
  }

  // `leggiOrari` torna una mappa giorno -> fasce, e tiene solo i giorni che
  // hanno almeno una fascia valida: nessuna chiave vuol dire nessun orario.
  const giorniAperti = Object.keys(leggiOrari(locale.openingHours)).length;

  if (modules.reservations && giorniAperti === 0) {
    problemi.push({
      chiave: "orari-prenotazioni",
      gravita: "rotto",
      titolo: "Nessuno puo' prenotare",
      effetto:
        "Senza orari di apertura la pagina di prenotazione non ha nessuna fascia da proporre: chi la apre non trova un solo orario libero e se ne va.",
      rimedio: "Scrivi gli orari in Impostazioni → Orari di apertura.",
      href: "/dashboard/impostazioni",
      azione: "Metti gli orari",
    });
  }

  if (modules.reservations && prenotabili.n === 0) {
    problemi.push({
      chiave: "tavoli-prenotabili",
      gravita: "rotto",
      titolo: "Nessun tavolo e' prenotabile",
      effetto:
        "Puoi avere gli orari giusti, ma se nessun tavolo e' segnato come prenotabile non c'e' niente da assegnare: la pagina rifiuta ogni richiesta.",
      rimedio: "Segna quali tavoli si danno a chi prenota, in Tavoli e QR.",
      href: "/dashboard/tables",
      azione: "Apri i tavoli",
    });
  }

  if (modules.qr_ordering && tavoli.n === 0) {
    problemi.push({
      chiave: "tavoli-qr",
      gravita: "rotto",
      titolo: "Non c'e' nessun QR da mettere sui tavoli",
      effetto:
        "L'ordinazione dal telefono e' accesa ma non esiste nessun tavolo, quindi non esiste nessun codice da scansionare: al tavolo non si puo' ordinare.",
      rimedio: "Crea i tavoli e stampa i loro QR.",
      href: "/dashboard/tables",
      azione: "Crea i tavoli",
    });
  }

  if ((modules.qr_ordering || modules.counter_orders) && prodotti.n === 0) {
    problemi.push({
      chiave: "menu-vuoto",
      gravita: "rotto",
      titolo: "Il menu e' vuoto",
      effetto:
        "Chi scansiona il QR trova una pagina senza niente da ordinare. E' la prima cosa che vede un cliente del locale.",
      rimedio: "Carica prodotti e prezzi.",
      href: "/dashboard/menu",
      azione: "Riempi il menu",
    });
  }

  // La consegna cerca gli indirizzi dei clienti intorno al locale. Senza
  // sapere dov'e' il locale, i risultati escono ordinati a caso: "Via Roma"
  // esiste in ogni comune d'Italia.
  if (modules.delivery && !(locale.address && locale.city)) {
    problemi.push({
      chiave: "indirizzo-consegna",
      gravita: "attenzione",
      titolo: "Non sappiamo dove sei",
      effetto:
        "La consegna a domicilio e' accesa ma il locale non ha un indirizzo: quando cerchi la via di un cliente i risultati non sono ordinati intorno a te, e trovare quella giusta diventa lento.",
      rimedio: "Scrivi l'indirizzo del locale nei dati di fatturazione.",
      href: "/dashboard/fatturazione",
      azione: "Metti l'indirizzo",
    });
  }

  // Asporto e consegna scrivono in rubrica: nome, telefono, indirizzo di chi
  // ordina. Senza il modulo si ricomincia da capo a ogni ordine.
  if ((modules.takeaway || modules.delivery) && !modules.customers) {
    problemi.push({
      chiave: "rubrica-spenta",
      gravita: "attenzione",
      titolo: "La rubrica e' spenta",
      effetto:
        "Asporto e consegna chiedono nome, telefono e indirizzo a ogni ordine, e senza rubrica non se li ricorda nessuno: al cliente abituale li richiedi tutte le volte.",
      rimedio: "Chiedici di accendere la rubrica clienti.",
      href: "/dashboard/fatturazione/pacchetti",
      azione: "Vedi i piani",
    });
  }

  return problemi;
}

export function contaRotti(problemi: Problema[]): number {
  return problemi.filter((p) => p.gravita === "rotto").length;
}
