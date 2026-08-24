import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { menuProducts, restaurantTables, tenants } from "@/lib/db/schema";
import { leggiOrari } from "@/lib/orari";
import { canaliWeb, leggiImpostazioniWeb } from "@/lib/ordini-web";
import { leggiFasce } from "@/lib/consegna";
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
        webOrderChannels: tenants.webOrderChannels,
        webOrderPiecesPerSlot: tenants.webOrderPiecesPerSlot,
        deliveryBands: tenants.deliveryBands,
        latitude: tenants.latitude,
        longitude: tenants.longitude,
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

  // Quello che il locale vende dal suo sito. Serve subito, perche' decide
  // anche se la posta gli serve o no.
  const cfgWeb = leggiImpostazioniWeb(locale);
  const canaliDalWeb = canaliWeb(cfgWeb, modules);

  // La posta serve a chi manda mail ai clienti: la prenotazione web — la
  // conferma, lo spostamento, la disdetta — e gli ordini dal sito, che senza
  // mail restano senza il "l'abbiamo accettato".
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

  if ((modules.reservations || canaliDalWeb.length > 0) && !postaPronta) {
    problemi.push({
      chiave: "posta-prenotazioni",
      // Senza posta la prenotazione e' rotta davvero: il cliente non ha altro
      // modo di sapere se il tavolo c'e'. L'ordine invece regge lo stesso —
      // resta la pagina col link e il telefono — ma il cliente aspetta al buio.
      gravita: modules.reservations ? "rotto" : "attenzione",
      titolo: "Le mail ai clienti non partono",
      effetto: [
        modules.reservations
          ? "La prenotazione web e' accesa, ma non c'e' nessuna casella di posta configurata: chi prenota dal sito non riceve nessuna conferma, e non gli arriva niente nemmeno se sposti o disdici la sua prenotazione. Le prenotazioni le vedi lo stesso in agenda — e' il cliente che resta senza risposta."
          : null,
        canaliDalWeb.length
          ? "Gli ordini dal sito sono accesi: chi ordina non riceve niente quando lo accettate o lo rifiutate, e per sapere a che punto e' deve essersi tenuto il link."
          : null,
      ]
        .filter(Boolean)
        .join(" "),
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

  // --- Ordini dal web -------------------------------------------------------
  //
  // Qui la pagina pubblica e' gia' online e il cliente ci arriva da Google:
  // quando non funziona non se ne accorge nessuno dentro al locale, si vede
  // solo dagli ordini che non arrivano.

  // Il modulo comprato ma senza un canale sotto: la pagina non esiste, e il
  // locale sta pagando qualcosa che non ha mai visto acceso.
  if (modules.web_orders && !modules.takeaway && !modules.delivery) {
    problemi.push({
      chiave: "web-senza-canali",
      gravita: "attenzione",
      titolo: "Gli ordini dal sito non hanno un canale",
      effetto:
        "Il modulo e' acceso ma il locale non ha ne' l'asporto ne' la consegna: la pagina d'ordinazione non esiste, e non c'e' niente da vendere dal sito.",
      rimedio: "Chiedici di accendere l'asporto, la consegna, o tutti e due.",
      href: "/dashboard/fatturazione/pacchetti",
      azione: "Vedi i piani",
    });
  }

  // Gli orari mancanti li ha gia' detti la prenotazione, con lo stesso rimedio
  // e lo stesso pulsante: ripeterlo insegna solo a non leggere gli avvisi.
  if (canaliDalWeb.length && giorniAperti === 0 && !modules.reservations) {
    problemi.push({
      chiave: "orari-ordini-web",
      gravita: "rotto",
      titolo: "Nessuno puo' ordinare dal web",
      effetto:
        "Asporto o domicilio dal web sono accesi, ma senza orari di apertura non c'e' nessuna fascia di ritiro da proporre: chi apre la pagina non trova un solo orario e se ne va.",
      rimedio: "Scrivi gli orari in Impostazioni → Orari di apertura.",
      href: "/dashboard/impostazioni",
      azione: "Metti gli orari",
    });
  }

  // Un canale acceso su un menu tutto escluso e' una pagina che si apre vuota:
  // il cliente non capisce se e' rotta o se non avete niente, e in tutti e due
  // i casi se ne va. Si conta solo per i canali accesi davvero: e' una query in
  // piu' per canale, e la fa solo chi vende dal web.
  const daVendere = [
    {
      canale: "asporto" as const,
      esce: eq(menuProducts.takeawayAvailable, true),
      titolo: "Non c'e' niente da portare via",
      effetto:
        "L'asporto dal web e' acceso, ma nessun prodotto del menu e' segnato come «si porta via»: chi apre la pagina la trova vuota.",
    },
    {
      canale: "domicilio" as const,
      esce: eq(menuProducts.deliveryAvailable, true),
      titolo: "Non c'e' niente da consegnare",
      effetto:
        "Il domicilio dal web e' acceso, ma nessun prodotto del menu e' segnato come «si consegna»: chi apre la pagina la trova vuota.",
    },
  ].filter((c) => canaliDalWeb.includes(c.canale));

  for (const che of daVendere) {
    const [quanti] = await db
      .select(uno)
      .from(menuProducts)
      .where(
        and(
          eq(menuProducts.tenantId, tenantId),
          eq(menuProducts.available, true),
          che.esce
        )
      );
    if (quanti.n === 0) {
      problemi.push({
        chiave: `menu-${che.canale}`,
        gravita: "rotto",
        titolo: che.titolo,
        effetto: che.effetto,
        rimedio:
          "Segna quali prodotti escono dal locale: sono le spunte «Si porta via» e «Si consegna» dentro «Modifica» di ogni prodotto.",
        href: "/dashboard/menu",
        azione: "Apri il menu",
      });
    }
  }


  // La consegna dal web ha due cose in piu' che devono esserci per forza: le
  // zone, e la posizione del locale. Senza le prime ogni indirizzo e' fuori
  // zona; senza la seconda non c'e' nessuna distanza da misurare. In tutti e
  // due i casi il cliente arriva in fondo all'ordine e si becca un no.
  if (canaliDalWeb.includes("domicilio")) {
    if (leggiFasce(locale.deliveryBands).length === 0) {
      problemi.push({
        chiave: "zone-consegna",
        gravita: "rotto",
        titolo: "Non c'e' nessuna zona di consegna",
        effetto:
          "Il domicilio dal web e' acceso ma non e' scritta nessuna zona: ogni indirizzo risulta fuori zona, e chi prova a ordinare viene rimandato al ritiro.",
        rimedio:
          "Scrivi fin dove arrivate e quanto costa, in Impostazioni → Zone di consegna.",
        href: "/dashboard/impostazioni",
        azione: "Scrivi le zone",
      });
    }

    if (locale.latitude == null || locale.longitude == null) {
      problemi.push({
        chiave: "posizione-locale",
        gravita: "rotto",
        titolo: "Il costo di consegna non si puo' calcolare",
        effetto:
          "Il costo esce dalla distanza fra voi e il cliente, ma non sappiamo ancora dove siete: ogni ordine a domicilio arriverebbe col costo da confermare a mano, uno per uno.",
        rimedio:
          "Controlla l'indirizzo del locale nei dati di fatturazione, poi apri Impostazioni → Zone di consegna: la posizione si cerca da sola.",
        href: "/dashboard/fatturazione",
        azione: "Controlla l'indirizzo",
      });
    }
  }

  // La consegna cerca gli indirizzi dei clienti intorno al locale. Senza
  // sapere dov'e' il locale, i risultati escono ordinati a caso: "Via Roma"
  // esiste in ogni comune d'Italia.
  //
  // A chi consegna dal web questa stessa cosa e' gia' stata detta come guasto,
  // e con parole piu' gravi: senza posizione non si calcola nemmeno il costo.
  // Ripeterla qui come "attenzione" la farebbe sembrare meno seria di quello
  // che e'.
  if (
    modules.delivery &&
    !canaliDalWeb.includes("domicilio") &&
    !(locale.address && locale.city)
  ) {
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
