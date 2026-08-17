"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reservations, restaurantTables, tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import {
  assegnaTavoli as scegliTavoli,
  leggiImpostazioni,
  occupazioniDelGiorno,
  orarioValido,
  salvaPrenotazione,
  tavoliLiberi,
  tavoliPrenotabili,
  type ImpostazioniPrenotazione,
  type StatoPrenotazione,
} from "@/lib/prenotazioni";
import {
  avvisaCliente,
  mittenteLocale,
  type TipoAvviso,
} from "@/lib/prenotazioni-mail";

// Le prenotazioni viste da dentro il locale. Qui lo staff puo' fare cose che
// dal web non si possono fare — prendere un tavolo pieno, spostare un gruppo,
// segnare chi non si e' presentato — perche' ha la sala davanti agli occhi e
// sa quello che il sistema non sa.
//
// Le tre risposte a una richiesta (la accetto, la sposto, la rifiuto) mandano
// tutte una mail: dal lato del cliente il silenzio e' indistinguibile dal
// «non ci hanno voluti».

async function requireTenantId(): Promise<string> {
  const s = await getSessionUser();
  if (!s) redirect("/login");
  if (!(await hasModule(s.tenantId, "reservations"))) redirect("/dashboard");
  return s.tenantId;
}

function aggiorna(): void {
  revalidatePath("/dashboard/prenotazioni");
  revalidatePath("/dashboard");
}

const COLONNE_CONFIG = {
  reservationSlotMinutes: tenants.reservationSlotMinutes,
  reservationDurationMinutes: tenants.reservationDurationMinutes,
  reservationMinParty: tenants.reservationMinParty,
  reservationMaxParty: tenants.reservationMaxParty,
  reservationLeadMinutes: tenants.reservationLeadMinutes,
  reservationHorizonDays: tenants.reservationHorizonDays,
  reservationAutoConfirm: tenants.reservationAutoConfirm,
  reservationMaxJoin: tenants.reservationMaxJoin,
  reservationExtraSeats: tenants.reservationExtraSeats,
  reservationNote: tenants.reservationNote,
};

async function impostazioni(
  tenantId: string
): Promise<ImpostazioniPrenotazione | null> {
  const [r] = await db
    .select(COLONNE_CONFIG)
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return r ? leggiImpostazioni(r) : null;
}

// Avvisa il cliente e segna quando. La mail non blocca niente: se la casella
// del locale non e' configurata o il cliente non ha lasciato un indirizzo, la
// prenotazione vale lo stesso e in pannello si vede che l'avviso non e' uscito.
async function avvisa(tenantId: string, id: string, tipo: TipoAvviso): Promise<void> {
  const [r] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId)))
    .limit(1);
  if (!r) return;

  const inviata = await avvisaCliente(
    tipo,
    {
      nome: r.customerName,
      email: r.customerEmail,
      startsAt: r.startsAt,
      partySize: r.partySize,
      tableNumbers: r.tableNumbers,
      token: r.token,
      previousStartsAt: r.previousStartsAt,
    },
    await mittenteLocale(tenantId)
  );

  if (inviata) {
    await db
      .update(reservations)
      .set({ notifiedAt: new Date() })
      .where(eq(reservations.id, id));
  }
}

async function cambiaStato(
  formData: FormData,
  stato: StatoPrenotazione,
  extra: Partial<{ seatedAt: Date | null; cancelledAt: Date | null }> = {},
  avviso?: TipoAvviso
): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await db
    .update(reservations)
    .set({ status: stato, ...extra })
    .where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId)));

  if (avviso) await avvisa(tenantId, id, avviso);
  aggiorna();
}

export async function confermaPrenotazione(formData: FormData): Promise<void> {
  await cambiaStato(formData, "confirmed", { cancelledAt: null }, "confermata");
}

export async function segnaArrivati(formData: FormData): Promise<void> {
  await cambiaStato(formData, "seated", { seatedAt: new Date() });
}

// Chi non si e' presentato non si cancella: resta scritto. E' l'unico modo per
// accorgersi che un numero di telefono buca i tavoli ogni sabato.
export async function segnaAssente(formData: FormData): Promise<void> {
  await cambiaStato(formData, "no_show");
}

export async function annullaPrenotazione(formData: FormData): Promise<void> {
  await cambiaStato(
    formData,
    "cancelled",
    { cancelledAt: new Date() },
    "annullata"
  );
}

// Spostare un gruppo: altro orario, altro numero di persone, o tutti e due.
//
// La modifica vale da subito in sala — il tavolo nuovo e' gia' bloccato — ma
// la prenotazione resta segnata «attende il cliente» finche' lui non risponde
// alla mail: cambiare l'orario a qualcuno e considerarlo d'accordo perche' non
// ha protestato e' il modo migliore per ritrovarsi il tavolo vuoto.
export async function spostaPrenotazione(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  const cfg = await impostazioni(tenantId);
  if (!id || !cfg) return;

  const [attuale] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId)))
    .limit(1);
  if (!attuale) return;

  const inizio =
    orarioValido(String(formData.get("giorno") ?? ""), String(formData.get("ora") ?? "")) ??
    attuale.startsAt;
  const richieste = parseInt(String(formData.get("persone") ?? ""), 10);
  const persone =
    Number.isInteger(richieste) && richieste >= 1 && richieste <= 50
      ? richieste
      : attuale.partySize;

  // I tavoli si ricalcolano sul nuovo orario, senza contare quelli che questa
  // stessa prenotazione sta occupando adesso. Se non c'e' niente di libero si
  // tiene l'assegnazione vecchia: la decisione resta a chi guarda la sala.
  const [tavoli, occupate] = await Promise.all([
    tavoliPrenotabili(tenantId),
    occupazioniDelGiorno(tenantId, inizio, cfg, { escludi: id }),
  ]);
  const scelti =
    scegliTavoli(tavoliLiberi(tavoli, occupate, inizio, cfg), persone, cfg) ??
    attuale.tableNumbers;

  await db
    .update(reservations)
    .set({
      startsAt: inizio,
      partySize: persone,
      tableNumbers: scelti,
      status: "proposed",
      // Si tiene l'orario originale, non quello di un'eventuale modifica
      // precedente: al cliente interessa cosa aveva chiesto lui.
      previousStartsAt: attuale.previousStartsAt ?? attuale.startsAt,
      cancelledAt: null,
    })
    .where(eq(reservations.id, id));

  await avvisa(tenantId, id, "spostata");
  aggiorna();
}

// Spostare un gruppo su un altro tavolo. Il valore arriva come "7" o "4+5":
// sono i numeri che lo staff legge in sala, e piu' d'uno quando i tavoli si
// accostano. Vuoto = la prenotazione resta senza posto assegnato.
export async function assegnaTavoli(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const numeri = [
    ...new Set(
      String(formData.get("tavoli") ?? "")
        .split("+")
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ].sort((a, b) => a - b);

  // Un tavolo che non esiste non si assegna: la comanda finirebbe a un numero
  // che in sala non c'e'.
  const esistenti = numeri.length
    ? (
        await db
          .select({ number: restaurantTables.number })
          .from(restaurantTables)
          .where(eq(restaurantTables.tenantId, tenantId))
      ).map((t) => t.number)
    : [];
  const validi = numeri.filter((n) => esistenti.includes(n));

  await db
    .update(reservations)
    .set({ tableNumbers: validi })
    .where(and(eq(reservations.id, id), eq(reservations.tenantId, tenantId)));
  aggiorna();
}

// La prenotazione presa al telefono. Non passa dai controlli del web: se il
// locale decide di aggiungere un tavolo in mezzo alla sala per una comitiva,
// il software non e' quello che glielo impedisce. Il tavolo si assegna da solo
// quando c'e' posto, altrimenti la riga resta senza e si sistema a mano.
export async function nuovaPrenotazione(formData: FormData): Promise<void> {
  const tenantId = await requireTenantId();
  const cfg = await impostazioni(tenantId);
  if (!cfg) return;

  const giorno = String(formData.get("giorno") ?? "");
  const ora = String(formData.get("ora") ?? "");
  const inizio = orarioValido(giorno, ora);
  const persone = parseInt(String(formData.get("persone") ?? ""), 10);
  const nome = String(formData.get("nome") ?? "").trim().slice(0, 80);
  const telefono = String(formData.get("telefono") ?? "").trim().slice(0, 32);
  const email = String(formData.get("email") ?? "").trim().slice(0, 160);
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);

  if (!inizio || !nome || !Number.isInteger(persone) || persone < 1 || persone > 50) {
    return;
  }

  const esito = await salvaPrenotazione({
    tenantId,
    inizio,
    persone,
    nome,
    // Al telefono il numero ce l'hai sul display: se non lo si scrive, resta il
    // trattino invece di un campo che finge di essere pieno.
    telefono: telefono || "—",
    email: email || null,
    note: note || null,
    source: "staff",
    stato: "confirmed",
    cfg,
    richiedeTavolo: false,
  });

  // Anche a chi ha telefonato, se ha lasciato l'indirizzo, arriva la conferma
  // con il link: e' il modo per disdire senza richiamare.
  if (esito.ok && email) {
    const [creata] = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(eq(reservations.token, esito.token))
      .limit(1);
    if (creata) await avvisa(tenantId, creata.id, "confermata");
  }

  aggiorna();
}
