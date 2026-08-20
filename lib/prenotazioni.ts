import { randomBytes } from "crypto";
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reservations, restaurantTables, tenants } from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { hasModule } from "@/lib/modules";
import {
  dataISO,
  fasceOrarie,
  giorniDisponibili,
  inMinuti,
  leggiCalendario,
  type Calendario,
} from "@/lib/orari";

// Prenotazione del tavolo: chi ci sta, quando, e su quale tavolo.
//
// Il pezzo che conta e' l'assegnazione. Un sistema che accetta prenotazioni
// senza guardare i tavoli non prenota niente: raccoglie richieste e lascia al
// locale il lavoro di capire, la sera stessa, se quelle persone ci entrano.
// Qui una fascia e' proponibile solo se esiste davvero un tavolo libero che
// tiene quel gruppo per tutta la durata del servizio.

export type ImpostazioniPrenotazione = {
  passoMinuti: number;
  durataMinuti: number;
  minPersone: number;
  maxPersone: number;
  preavvisoMinuti: number;
  giorniAvanti: number;
  confermaAutomatica: boolean;
  // Quanti tavoli si possono accostare per un gruppo solo (1 = non si uniscono).
  maxTavoliUniti: number;
  // Sedie che si possono aggiungere a ogni tavolo.
  sedieExtra: number;
  nota: string | null;
};

// Colonne del tenant da cui si leggono. Prende un oggetto e non l'intera riga
// cosi' la funzione resta usabile anche da una query con `select` parziale.
export type RigaImpostazioni = {
  reservationSlotMinutes: number;
  reservationDurationMinutes: number;
  reservationMinParty: number;
  reservationMaxParty: number;
  reservationLeadMinutes: number;
  reservationHorizonDays: number;
  reservationAutoConfirm: boolean;
  reservationMaxJoin: number;
  reservationExtraSeats: number;
  reservationNote: string | null;
};

export function leggiImpostazioni(r: RigaImpostazioni): ImpostazioniPrenotazione {
  return {
    passoMinuti: r.reservationSlotMinutes,
    durataMinuti: r.reservationDurationMinutes,
    minPersone: r.reservationMinParty,
    maxPersone: r.reservationMaxParty,
    preavvisoMinuti: r.reservationLeadMinutes,
    giorniAvanti: r.reservationHorizonDays,
    confermaAutomatica: r.reservationAutoConfirm,
    maxTavoliUniti: r.reservationMaxJoin,
    sedieExtra: r.reservationExtraSeats,
    nota: r.reservationNote,
  };
}

// Limiti di quello che si puo' salvare. Sono qui e non solo nella pagina delle
// impostazioni perche' li usa anche l'onboarding, e un valore assurdo a
// database si porta dietro una sala che non torna.
export function normalizzaImpostazioni(
  v: Partial<Record<keyof ImpostazioniPrenotazione, unknown>>
): ImpostazioniPrenotazione {
  const num = (x: unknown, min: number, max: number, fallback: number) => {
    const n = typeof x === "number" ? x : parseInt(String(x ?? ""), 10);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };

  const minPersone = num(v.minPersone, 1, 20, 1);
  const nota = typeof v.nota === "string" ? v.nota.trim().slice(0, 300) : "";

  return {
    passoMinuti: num(v.passoMinuti, 10, 120, 30),
    durataMinuti: num(v.durataMinuti, 30, 360, 105),
    minPersone,
    // Il massimo non puo' finire sotto il minimo, o non resterebbe nessun
    // numero di persone da poter scegliere.
    maxPersone: Math.max(minPersone, num(v.maxPersone, 1, 50, 8)),
    preavvisoMinuti: num(v.preavvisoMinuti, 0, 7 * 24 * 60, 120),
    giorniAvanti: num(v.giorniAvanti, 1, 365, 30),
    confermaAutomatica: !!v.confermaAutomatica,
    // Oltre gli otto tavoli accostati non c'e' piu' un tavolo, c'e' una sala
    // riservata: quella si concorda a voce.
    maxTavoliUniti: num(v.maxTavoliUniti, 1, 8, 3),
    sedieExtra: num(v.sedieExtra, 0, 6, 0),
    nota: nota || null,
  };
}

// --- Stati -----------------------------------------------------------------

export type StatoPrenotazione =
  | "pending"
  | "confirmed"
  | "proposed"
  | "seated"
  | "cancelled"
  | "no_show";

// Gli stati che tengono il tavolo occupato. Una richiesta ancora da confermare
// occupa quanto una confermata: mentre il locale decide, quel posto non si
// puo' vendere due volte. Vale anche per una spostata: il tavolo nuovo e' gia'
// suo, altrimenti glielo si prenderebbe mentre legge la mail.
export const STATI_ATTIVI: StatoPrenotazione[] = [
  "pending",
  "confirmed",
  "proposed",
  "seated",
];

export const ETICHETTA_STATO: Record<StatoPrenotazione, string> = {
  pending: "Da confermare",
  confirmed: "Confermata",
  proposed: "Spostata, attende il cliente",
  seated: "Arrivati",
  cancelled: "Annullata",
  no_show: "Non presentato",
};

export const BADGE_STATO: Record<StatoPrenotazione, string> = {
  pending: "badge-warn",
  confirmed: "badge-brand",
  proposed: "badge-warn",
  seated: "badge-ok",
  cancelled: "badge-muted",
  no_show: "badge-danger",
};

export function isStato(v: string): v is StatoPrenotazione {
  return v in ETICHETTA_STATO;
}

// --- Tavoli ----------------------------------------------------------------

export type TavoloPrenotabile = { numero: number; posti: number };

export type Occupazione = {
  startsAt: Date;
  tableNumbers: number[];
};

export function fineServizio(inizio: Date, cfg: ImpostazioniPrenotazione): Date {
  return new Date(inizio.getTime() + cfg.durataMinuti * 60000);
}

// I tavoli ancora liberi in una finestra. Due prenotazioni si danno fastidio
// se le loro finestre si accavallano anche di un minuto: il tavolo va
// sparecchiato prima, non mentre.
export function tavoliLiberi(
  tavoli: TavoloPrenotabile[],
  occupate: Occupazione[],
  inizio: Date,
  cfg: ImpostazioniPrenotazione
): TavoloPrenotabile[] {
  const fine = fineServizio(inizio, cfg);
  const presi = new Set<number>();
  for (const p of occupate) {
    const suoInizio = p.startsAt.getTime();
    const suaFine = fineServizio(p.startsAt, cfg).getTime();
    if (suoInizio < fine.getTime() && suaFine > inizio.getTime()) {
      for (const n of p.tableNumbers) presi.add(n);
    }
  }
  return tavoli.filter((t) => !presi.has(t.numero));
}

// Quanta gente tiene un tavolo stasera. Non e' il numero di sedie che ha
// intorno adesso: una sedia in piu' fa entrare la terza persona a un tavolo da
// due, ed e' quello che in sala si fa senza pensarci.
export function capienza(
  t: TavoloPrenotabile,
  cfg: ImpostazioniPrenotazione
): number {
  return t.posti + cfg.sedieExtra;
}

export function postiPrenotabili(
  tavoli: TavoloPrenotabile[],
  cfg: ImpostazioniPrenotazione
): number {
  return tavoli.reduce((s, t) => s + capienza(t, cfg), 0);
}

// Quali tavoli dare a un gruppo.
//
// La sala non e' fatta di posti fissi: cinque tavoli da due, accostati,
// diventano un tavolo da dieci. Quindi non si cerca "il tavolo giusto" ma la
// combinazione giusta, e fra tutte quelle che tengono il gruppo si prende
// **quella che spreca meno posti** — dare il tavolo da otto a due persone vuol
// dire rifiutare la comitiva che chiama dieci minuti dopo. A parita' di
// spreco si sposta il minor numero di tavoli, che e' lavoro vero per chi
// apparecchia.
export function assegnaTavoli(
  liberi: TavoloPrenotabile[],
  persone: number,
  cfg: ImpostazioniPrenotazione
): number[] | null {
  const maxTavoli = Math.max(1, cfg.maxTavoliUniti);
  const cap = (t: TavoloPrenotabile) => capienza(t, cfg);

  if (maxTavoli === 1) {
    const singolo = [...liberi]
      .filter((t) => cap(t) >= persone)
      .sort((a, b) => cap(a) - cap(b) || a.numero - b.numero)[0];
    return singolo ? [singolo.numero] : null;
  }

  // Oltre "quello che serve piu' il tavolo piu' grande" non c'e' niente da
  // guardare: una combinazione da cui non si puo' togliere niente non supera
  // mai quella soglia, e le altre sprecano di piu' per definizione.
  const massima = Math.max(0, ...liberi.map(cap));
  const limite = persone + massima;

  // Per ogni capienza raggiungibile si tiene l'insieme di tavoli piu' corto.
  let stati = new Map<number, number[]>([[0, []]]);
  for (const t of liberi) {
    const prossimi = new Map(stati);
    for (const [somma, insieme] of stati) {
      if (insieme.length >= maxTavoli) continue;
      const nuova = somma + cap(t);
      if (nuova > limite) continue;
      const esistente = prossimi.get(nuova);
      if (!esistente || esistente.length > insieme.length + 1) {
        prossimi.set(nuova, [...insieme, t.numero]);
      }
    }
    stati = prossimi;
  }

  let scelta: number[] | null = null;
  let migliore = Infinity;
  for (const [somma, insieme] of stati) {
    if (!insieme.length || somma < persone) continue;
    if (
      somma < migliore ||
      (somma === migliore && scelta && insieme.length < scelta.length)
    ) {
      migliore = somma;
      scelta = insieme;
    }
  }

  return scelta ? [...scelta].sort((a, b) => a - b) : null;
}

// --- Fasce e giorni --------------------------------------------------------

// L'ultima prenotazione non si prende all'ora di chiusura: chi si siede deve
// avere il tempo di mangiare. Mezz'ora e' il minimo sindacale, e resta fisso
// perche' e' una regola del mestiere, non una preferenza del locale.
const MARGINE_CHIUSURA = 30;

export function fascePrenotabili(
  orari: Calendario,
  giorno: Date,
  adesso: Date,
  cfg: ImpostazioniPrenotazione
): string[] {
  return fasceOrarie(orari, giorno, adesso, {
    passo: cfg.passoMinuti,
    anticipo: cfg.preavvisoMinuti,
    margine: MARGINE_CHIUSURA,
  });
}

export function giorniPrenotabili(
  orari: Calendario,
  adesso: Date,
  cfg: ImpostazioniPrenotazione
): Date[] {
  return giorniDisponibili(
    orari,
    adesso,
    // Un elenco piu' lungo di due settimane non si sfoglia: chi prenota per
    // fra un mese sceglie la data, non scorre le pillole.
    14,
    {
      passo: cfg.passoMinuti,
      anticipo: cfg.preavvisoMinuti,
      margine: MARGINE_CHIUSURA,
    },
    cfg.giorniAvanti
  );
}

// Se una data sta dentro la finestra in cui il locale prende impegni. Le
// pillole in pagina si fermano a due settimane, ma il campo data arriva fino
// all'orizzonte: il controllo va fatto sull'orizzonte, non sull'elenco
// mostrato, o prenotare per il mese prossimo risulterebbe sempre pieno.
export function dentroFinestra(
  quando: Date,
  adesso: Date,
  cfg: ImpostazioniPrenotazione
): boolean {
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const limite = new Date(
    oggi.getFullYear(),
    oggi.getMonth(),
    oggi.getDate() + cfg.giorniAvanti,
    23,
    59
  );
  return quando >= oggi && quando <= limite;
}

export function orarioValido(giorno: string, ora: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !/^\d{1,2}:\d{2}$/.test(ora)) {
    return null;
  }
  const d = new Date(`${giorno}T${ora.padStart(5, "0")}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// --- Disponibilita' --------------------------------------------------------

export type Fascia = { ora: string; tavoli: number[] };

export function disponibilita({
  orari,
  tavoli,
  occupate,
  giorno,
  adesso,
  persone,
  cfg,
}: {
  orari: Calendario;
  tavoli: TavoloPrenotabile[];
  occupate: Occupazione[];
  giorno: Date;
  adesso: Date;
  persone: number;
  cfg: ImpostazioniPrenotazione;
}): Fascia[] {
  const out: Fascia[] = [];
  for (const ora of fascePrenotabili(orari, giorno, adesso, cfg)) {
    const inizio = new Date(
      giorno.getFullYear(),
      giorno.getMonth(),
      giorno.getDate(),
      Math.floor(inMinuti(ora) / 60),
      inMinuti(ora) % 60
    );
    const scelti = assegnaTavoli(
      tavoliLiberi(tavoli, occupate, inizio, cfg),
      persone,
      cfg
    );
    if (scelti) out.push({ ora, tavoli: scelti });
  }
  return out;
}

// --- Query condivise -------------------------------------------------------

export async function tavoliPrenotabili(
  tenantId: string
): Promise<TavoloPrenotabile[]> {
  const rows = await db
    .select({ numero: restaurantTables.number, posti: restaurantTables.seats })
    .from(restaurantTables)
    .where(
      and(
        eq(restaurantTables.tenantId, tenantId),
        eq(restaurantTables.bookable, true)
      )
    )
    .orderBy(asc(restaurantTables.number));
  return rows;
}

// Le prenotazioni che possono toccare un giorno. Si parte da prima di
// mezzanotte: una che inizia alle 23:30 occupa ancora un tavolo alle 00:30, e
// dimenticarla vorrebbe dire assegnarlo due volte.
export function finestraGiorno(
  giorno: Date,
  cfg: ImpostazioniPrenotazione
): [Date, Date] {
  return [
    new Date(
      giorno.getFullYear(),
      giorno.getMonth(),
      giorno.getDate(),
      0,
      -cfg.durataMinuti
    ),
    new Date(
      giorno.getFullYear(),
      giorno.getMonth(),
      giorno.getDate() + 1,
      0,
      cfg.durataMinuti
    ),
  ];
}

// L'esecutore e' il database o una transazione aperta: assegnare un tavolo
// deve poter leggere le occupazioni dentro la stessa transazione che poi
// scrive, altrimenti fra la lettura e la scrittura ci sta un'altra prenotazione.
type Esecutore = Pick<typeof db, "select">;

export async function occupazioniDelGiorno(
  tenantId: string,
  giorno: Date,
  cfg: ImpostazioniPrenotazione,
  {
    esecutore = db,
    // La prenotazione che si sta spostando non fa concorrenza a se stessa:
    // senza escluderla, spostarla di mezz'ora la troverebbe sempre occupata.
    escludi,
  }: { esecutore?: Esecutore; escludi?: string } = {}
): Promise<Occupazione[]> {
  const [da, a] = finestraGiorno(giorno, cfg);

  return esecutore
    .select({
      startsAt: reservations.startsAt,
      tableNumbers: reservations.tableNumbers,
    })
    .from(reservations)
    .where(
      and(
        eq(reservations.tenantId, tenantId),
        gte(reservations.startsAt, da),
        lt(reservations.startsAt, a),
        inArray(reservations.status, STATI_ATTIVI),
        ...(escludi ? [ne(reservations.id, escludi)] : [])
      )
    );
}

// Scrive la prenotazione assegnando il tavolo nello stesso momento in cui la
// salva.
//
// Il lucchetto per locale esiste perche' due persone possono premere "prenota"
// nello stesso secondo: senza, entrambe leggerebbero lo stesso tavolo libero e
// finirebbero sedute l'una in braccio all'altra. E' un lucchetto di
// transazione — si apre da solo quando la transazione finisce, comunque
// finisca — e stringe un locale alla volta, non tutto il servizio.
export type EsitoPrenotazione =
  | { ok: true; token: string; tavoli: number[] }
  | { ok: false; errore: string };

export async function salvaPrenotazione(input: {
  tenantId: string;
  inizio: Date;
  persone: number;
  nome: string;
  telefono: string;
  email?: string | null;
  note?: string | null;
  source: "web" | "staff";
  stato: StatoPrenotazione;
  cfg: ImpostazioniPrenotazione;
  // Il web rifiuta se non c'e' posto; lo staff, che ha la sala davanti e sa
  // quello che il sistema non sa, la prende lo stesso e assegna a mano.
  richiedeTavolo: boolean;
}): Promise<EsitoPrenotazione> {
  const { tenantId, inizio, persone, cfg } = input;
  const token = randomBytes(9).toString("hex");

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`
    );

    const tavoli = await tavoliPrenotabili(tenantId);
    const occupate = await occupazioniDelGiorno(tenantId, inizio, cfg, {
      esecutore: tx,
    });
    const scelti =
      assegnaTavoli(tavoliLiberi(tavoli, occupate, inizio, cfg), persone, cfg) ??
      [];

    if (input.richiedeTavolo && !scelti.length) {
      return {
        ok: false as const,
        errore:
          "Quell'orario e' appena stato preso. Scegline un altro: l'elenco qui sopra e' gia' aggiornato.",
      };
    }

    await tx.insert(reservations).values({
      tenantId,
      startsAt: inizio,
      partySize: persone,
      tableNumbers: scelti,
      customerName: input.nome,
      customerPhone: input.telefono,
      customerEmail: input.email ?? null,
      notes: input.note ?? null,
      status: input.stato,
      source: input.source,
      token,
    });

    return { ok: true as const, token, tavoli: scelti };
  });
}

// Il locale che sta rispondendo, con quello che serve a prenotare. Lo usano la
// pagina pubblica e le sue azioni: entrambe partono dal sottodominio, e
// nessuna delle due deve fidarsi di un identificativo arrivato dal client.
export type ContestoPrenotazione = {
  tenantId: string;
  nome: string;
  logoUrl: string | null;
  telefono: string | null;
  indirizzo: string | null;
  orari: Calendario;
  cfg: ImpostazioniPrenotazione;
  // Se il locale ha la posta configurata. Con la mail attiva l'indirizzo del
  // cliente diventa obbligatorio: e' il modo in cui gli arriva la conferma e
  // il link per disdire, e chiederlo "se vuole" vorrebbe dire prometterglielo
  // e non mandarglielo.
  mailAttiva: boolean;
};

export async function contestoPrenotazione(): Promise<ContestoPrenotazione | null> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) return null;
  if (!(await hasModule(tenant.id, "reservations"))) return null;

  const [row] = await db
    .select({
      phone: tenants.phone,
      address: tenants.address,
      city: tenants.city,
      openingHours: tenants.openingHours,
      closureDays: tenants.closureDays,
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
      smtpHost: tenants.smtpHost,
      smtpUser: tenants.smtpUser,
      smtpPass: tenants.smtpPass,
    })
    .from(tenants)
    .where(eq(tenants.id, tenant.id))
    .limit(1);
  if (!row) return null;

  return {
    tenantId: tenant.id,
    nome: tenant.name,
    logoUrl: tenant.logoUrl,
    telefono: row.phone,
    indirizzo: [row.address, row.city].filter(Boolean).join(", ") || null,
    orari: leggiCalendario(row.openingHours, row.closureDays),
    cfg: leggiImpostazioni(row),
    mailAttiva: !!(row.smtpHost && row.smtpUser && row.smtpPass),
  };
}

// Etichetta leggibile dei tavoli assegnati: "Tavolo 7" o "Tavoli 4+5".
export function etichettaTavoli(numeri: number[]): string | null {
  if (!numeri.length) return null;
  return numeri.length === 1
    ? `Tavolo ${numeri[0]}`
    : `Tavoli ${numeri.join("+")}`;
}

export function giornoLeggibile(d: Date, adesso: Date): string {
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate()).getTime()) /
      86400000
  );
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Domani";
  return d.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export { dataISO };
