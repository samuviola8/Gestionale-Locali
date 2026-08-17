import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuCategories,
  menuProducts,
  orders,
  restaurantTables,
  tenants,
  users,
} from "@/lib/db/schema";
import { aperto, leggiOrari } from "@/lib/orari";
import type { ModuleState } from "@/lib/modules";

// Cosa manca a un locale appena aperto per essere operativo.
//
// Nessuno stato salvato: ogni passo si legge dai dati veri, quindi la
// checklist non puo' mentire ne' restare indietro. Quando i passi necessari
// sono fatti smette di comparire da sola — l'ultimo e' il primo ordine
// ricevuto, cioe' la prova che il giro completo funziona.

export type PassoAvvio = {
  chiave: string;
  titolo: string;
  // Cosa fare, in una riga.
  testo: string;
  // Come sta adesso, coi numeri del locale: "3 categorie · 18 prodotti".
  stato: string;
  fatto: boolean;
  href: string;
  azione: string;
  // Utile ma non indispensabile: si spunta se fatto, ma non trattiene la
  // checklist. Un bar a conduzione familiare non aggiungera' mai un account,
  // e non deve restare con un elenco eternamente incompleto.
  facoltativo?: boolean;
};

export type Avvio = {
  passi: PassoAvvio[];
  // Contati sui soli passi necessari.
  fatti: number;
  totale: number;
  completa: boolean;
};

function plurale(n: number, singolare: string, plurale: string): string {
  return `${n} ${n === 1 ? singolare : plurale}`;
}

export async function getAvvio(
  tenantId: string,
  modules: ModuleState
): Promise<Avvio> {
  const uno = { n: count() };
  const [
    [categorie],
    [prodotti],
    [tavoli],
    [ordini],
    [account],
    [locale],
  ] = await Promise.all([
    db
      .select(uno)
      .from(menuCategories)
      .where(eq(menuCategories.tenantId, tenantId)),
    db.select(uno).from(menuProducts).where(eq(menuProducts.tenantId, tenantId)),
    db
      .select(uno)
      .from(restaurantTables)
      .where(eq(restaurantTables.tenantId, tenantId)),
    db.select(uno).from(orders).where(eq(orders.tenantId, tenantId)),
    db.select(uno).from(users).where(eq(users.tenantId, tenantId)),
    db
      .select({ openingHours: tenants.openingHours })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1),
  ]);

  const passi: PassoAvvio[] = [];

  passi.push({
    chiave: "menu",
    titolo: "Metti il menu online",
    testo:
      "Crea le categorie e i prodotti: è quello che il cliente vede appena inquadra il QR.",
    stato: prodotti.n
      ? `${plurale(prodotti.n, "prodotto", "prodotti")} in ${plurale(categorie.n, "categoria", "categorie")}`
      : categorie.n
        ? `${plurale(categorie.n, "categoria", "categorie")}, ancora senza prodotti`
        : "Ancora niente a menu",
    fatto: prodotti.n > 0 && categorie.n > 0,
    href: "/dashboard/menu",
    azione: "Vai al menu",
  });

  // I tavoli servono al QR e alla prenotazione: senza nessuno dei due, la sala
  // non e' un passo dell'avvio.
  if (modules.qr_ordering || modules.reservations) {
    passi.push({
      chiave: "tavoli",
      titolo: "Crea i tavoli e stampa i QR",
      testo: modules.qr_ordering
        ? "Ogni tavolo ha il suo codice: stampalo e mettilo sul tavolo. Un QR sul tavolo sbagliato manda gli ordini altrove."
        : "Numero e posti di ogni tavolo: è così che la prenotazione sa chi ci sta.",
      stato: tavoli.n ? plurale(tavoli.n, "tavolo", "tavoli") : "Nessun tavolo",
      fatto: tavoli.n > 0,
      href: "/dashboard/tables",
      azione: "Vai ai tavoli",
    });
  }

  // Gli orari li chiede solo chi vende fuori dalla sala o prende prenotazioni:
  // per il solo QR al tavolo non cambiano niente, e la sezione in
  // Impostazioni non compare nemmeno.
  if (modules.reservations || modules.takeaway || modules.delivery) {
    const orari = leggiOrari(locale?.openingHours);
    const giorniAperti = [0, 1, 2, 3, 4, 5, 6].filter((g) =>
      aperto(orari, g)
    ).length;
    passi.push({
      chiave: "orari",
      titolo: "Scrivi gli orari di apertura",
      testo: modules.reservations
        ? "Da lì escono le fasce che il cliente vede quando prenota. Senza orari non gli si può proporre niente."
        : "Da lì escono le fasce di ritiro e consegna proposte in cassa.",
      stato: giorniAperti
        ? `Aperto ${plurale(giorniAperti, "giorno", "giorni")} su 7`
        : "Nessun giorno di apertura",
      fatto: giorniAperti > 0,
      href: "/dashboard/impostazioni",
      azione: "Vai alle impostazioni",
    });
  }

  passi.push({
    chiave: "prova",
    titolo: "Fai un ordine di prova",
    testo: modules.qr_ordering
      ? "Inquadra col telefono il QR di un tavolo e manda un ordine: lo vedi arrivare qui, in coda, come farà il cliente."
      : "Batti un ordine in cassa: è il modo di vedere il giro completo prima del primo cliente vero.",
    stato: ordini.n ? "Il primo ordine è arrivato" : "Nessun ordine ancora",
    fatto: ordini.n > 0,
    href: modules.qr_ordering ? "/dashboard/orders" : "/dashboard/banco",
    azione: modules.qr_ordering ? "Vai alla coda" : "Vai alla cassa",
  });

  passi.push({
    chiave: "staff",
    titolo: "Aggiungi chi lavora con te",
    testo:
      "Un account a testa: chi prende gli ordini non deve entrare col tuo. Puoi legarlo a un reparto, così vede solo la sua coda.",
    stato:
      account.n > 1
        ? `${plurale(account.n, "account", "account")} attivi`
        : "Solo il tuo account",
    fatto: account.n > 1,
    href: "/dashboard/staff",
    azione: "Vai allo staff",
    facoltativo: true,
  });

  const necessari = passi.filter((p) => !p.facoltativo);
  const fatti = necessari.filter((p) => p.fatto).length;

  return {
    passi,
    fatti,
    totale: necessari.length,
    completa: fatti === necessari.length,
  };
}
