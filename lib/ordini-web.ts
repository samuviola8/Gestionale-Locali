import { randomBytes } from "crypto";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  menuProducts,
  menuProductVariants,
  orderItems,
  orders,
  tenants,
} from "@/lib/db/schema";
import { getTenantFromHost } from "@/lib/tenant-host";
import { getTenantModules } from "@/lib/modules";
import {
  dataISO,
  fasceOrarie,
  giorniDisponibili,
  inMinuti,
  leggiCalendario,
  type Calendario,
} from "@/lib/orari";
import { leggiFasce, type FasciaConsegna } from "@/lib/consegna";
import { createOrderRows, type IncomingItem } from "@/lib/order-create";
import type { Channel } from "@/lib/channels";
import { getChannel } from "@/lib/channels";
import type { ModuleState } from "@/lib/modules";

// Le regole con cui il cliente ordina dal sito del locale: asporto e
// domicilio, senza telefonata e senza tavolo.
//
// Somiglia alla prenotazione ma non e' la stessa cosa, e la differenza non e'
// tecnica. Un tavolo prenotato e' spazio: se salta, resta un tavolo vuoto. Un
// ordine e' roba cucinata, che il locale ha gia' pagato quando il cliente
// cambia idea. Da qui vengono i numeri che contano davvero: il preavviso,
// perche' la cucina deve avere il tempo di farlo, e i pezzi per fascia, perche'
// il forno ha un fondo.
//
// Ogni canale ha le sue regole, e quasi niente si divide: il ritiro si prepara
// in venti minuti e la consegna in quaranta, il ritiro si prende fino a
// stasera e la consegna solo su prenotazione, il ritiro entra da solo in
// cucina e la consegna la si guarda prima. Un solo numero per tutti e due
// vorrebbe dire tararlo sul peggiore e rovinare l'altro.

export type ImpostazioniCanale = {
  // Il canale si vende dal sito. Il modulo dice che il locale lo fa; questo
  // che lo prende anche da qui.
  attivo: boolean;
  // Ogni quanto si propone un orario.
  passoMinuti: number;
  // Quanto tempo serve al locale prima di poterlo consegnare.
  preavvisoMinuti: number;
  // Fin quando in avanti si prendono ordini.
  giorniAvanti: number;
  // Sotto questa spesa il canale non si usa. 0 = nessun minimo. A domicilio si
  // somma alle zone: vale il piu' alto fra questo e il minimo della fascia,
  // perche' uno e' la regola del locale e l'altro quella di quella strada.
  minimoCents: number;
  // L'ordine entra in cucina da solo, senza che nessuno lo guardi.
  accettazioneAutomatica: boolean;
  // Se al cliente parte la mail quando l'ordine viene preso in carico o
  // rifiutato. Serve la casella del locale configurata: senza, non parte
  // niente comunque.
  mailConferme: boolean;
  // E se gli parte una mail anche a ogni passo dopo — in preparazione, pronto,
  // uscito dal locale. Sono tre mail per ordine: c'e' chi le vuole e chi le
  // considera spam, e la differenza la decide il locale.
  mailAggiornamenti: boolean;
  // E se una copia arriva anche sulla casella del locale, a ogni ordine nuovo.
  // E' l'altra meta' ed e' un'altra cosa: le due di sopra parlano al cliente,
  // questa parla a chi lavora. Chi tiene la coda sempre a schermo la spegne e
  // non si ritrova la casella piena; chi il pannello lo apre due volte al
  // giorno la tiene accesa, o gli ordini scadono mentre nessuno guarda.
  mailLocale: boolean;
  // La riga mostrata a chi ordina su questo canale.
  nota: string | null;
};

export type ImpostazioniOrdiniWeb = {
  asporto: ImpostazioniCanale;
  domicilio: ImpostazioniCanale;
  // Quanti pezzi tiene una fascia, contando asporto e domicilio **insieme**:
  // e' l'unica cosa che resta in comune, perche' la cucina e' una sola e due
  // tetti separati direbbero venti dove il numero vero e' dieci.
  // 0 = nessun tetto.
  pezziPerFascia: number;
};

// Le colonne del tenant da cui si leggono. Un oggetto e non la riga intera,
// cosi' la funzione resta usabile da una query con `select` parziale.
export type RigaImpostazioniWeb = {
  webOrderChannels: unknown;
  webOrderPiecesPerSlot: number;
};

const DEFAULT_CANALE: Record<"asporto" | "domicilio", ImpostazioniCanale> = {
  asporto: {
    attivo: false,
    passoMinuti: 15,
    preavvisoMinuti: 20,
    giorniAvanti: 7,
    minimoCents: 0,
    accettazioneAutomatica: false,
    mailConferme: true,
    mailAggiornamenti: true,
    mailLocale: true,
    nota: null,
  },
  domicilio: {
    attivo: false,
    passoMinuti: 15,
    // La consegna ha in piu' il giro di chi consegna: parte piu' avanti.
    preavvisoMinuti: 40,
    giorniAvanti: 7,
    minimoCents: 0,
    accettazioneAutomatica: false,
    mailConferme: true,
    mailAggiornamenti: true,
    mailLocale: true,
    nota: null,
  },
};

// Limiti di quello che si puo' salvare. Un numero assurdo non da' errore: si
// traduce in fasce che non esistono, e il locale se ne accorge dagli ordini che
// non arrivano. Vale sia per quello che arriva dal modulo sia per quello che si
// rilegge da jsonb, che e' testo che nessuno controlla piu' da anni.
export function normalizzaCanale(
  v: unknown,
  quale: "asporto" | "domicilio"
): ImpostazioniCanale {
  const d = DEFAULT_CANALE[quale];
  const r = (v ?? {}) as Partial<Record<keyof ImpostazioniCanale, unknown>>;

  const num = (x: unknown, min: number, max: number, fallback: number) => {
    const n = typeof x === "number" ? x : parseInt(String(x ?? ""), 10);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  const nota = typeof r.nota === "string" ? r.nota.trim().slice(0, 300) : "";
  // Le spunte che nascono accese vanno lette col loro default: un blocco
  // salvato prima che esistessero non le ha, e `!!undefined` le spegnerebbe
  // a un locale che non ha mai chiesto di spegnerle.
  const bool = (x: unknown, quando: boolean) => (x === undefined ? quando : !!x);

  return {
    attivo: !!r.attivo,
    // Sotto il quarto d'ora le fasce diventano un elenco da scorrere, e a chi
    // ordina non cambia niente: nessuno ritira "alle 20:05 e non alle 20:10".
    passoMinuti: num(r.passoMinuti, 5, 60, d.passoMinuti),
    // Zero e' permesso: il bar che fa panini li fa mentre il cliente arriva.
    // Il tetto e' la giornata: oltre non e' piu' preavviso, e' un altro giorno.
    preavvisoMinuti: num(r.preavvisoMinuti, 0, 1440, d.preavvisoMinuti),
    // Un mese e' gia' oltre il ragionevole: nessuno ordina una pizza per il
    // mese prossimo, e una finestra lunga e' solo un elenco da sfogliare.
    giorniAvanti: num(r.giorniAvanti, 1, 30, d.giorniAvanti),
    minimoCents: num(r.minimoCents, 0, 100000, 0),
    accettazioneAutomatica: !!r.accettazioneAutomatica,
    mailConferme: bool(r.mailConferme, d.mailConferme),
    mailAggiornamenti: bool(r.mailAggiornamenti, d.mailAggiornamenti),
    mailLocale: bool(r.mailLocale, d.mailLocale),
    nota: nota || null,
  };
}

export function leggiImpostazioniWeb(
  r: RigaImpostazioniWeb
): ImpostazioniOrdiniWeb {
  const canali = (r.webOrderChannels ?? {}) as Record<string, unknown>;
  return {
    asporto: normalizzaCanale(canali.asporto, "asporto"),
    domicilio: normalizzaCanale(canali.domicilio, "domicilio"),
    pezziPerFascia: normalizzaPezzi(r.webOrderPiecesPerSlot),
  };
}

export function normalizzaPezzi(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isInteger(n) && n >= 0 && n <= 500 ? n : 0;
}

// Le regole del canale che si sta usando. Sta qui e non nei chiamanti perche'
// il giorno che se ne aggiunge un terzo — il ritiro al banco, per dirne una —
// nessuno deve ricordarsi tutti i posti in cui si sceglieva fra due.
export function canaleDi(
  cfg: ImpostazioniOrdiniWeb,
  canale: Channel
): ImpostazioniCanale {
  return canale === "domicilio" ? cfg.domicilio : cfg.asporto;
}

// I canali che il cliente puo' davvero scegliere sul sito. Ci vogliono tre si'
// e non uno solo, e sono tre cose diverse:
//
//   - `web_orders`, il modulo: questo locale ha comprato la vendita dal sito;
//   - il modulo del canale: questo locale fa asporto (anche solo in cassa);
//   - l'interruttore in impostazioni: e quell'asporto lo prende anche dal web.
//
// Guardarne una sola vorrebbe dire pubblicare una pagina che il locale non ha
// chiesto, o farla sparire a chi l'ha pagata.
export function canaliWeb(
  cfg: ImpostazioniOrdiniWeb,
  modules: ModuleState
): Channel[] {
  if (!modules.web_orders) return [];

  const scelte: [Channel, boolean][] = [
    ["asporto", cfg.asporto.attivo],
    ["domicilio", cfg.domicilio.attivo],
  ];
  return scelte
    .filter(([canale, acceso]) => {
      const def = getChannel(canale);
      return acceso && !!def.module && modules[def.module];
    })
    .map(([canale]) => canale);
}

export function ordiniWebAttivi(
  cfg: ImpostazioniOrdiniWeb,
  modules: ModuleState
): boolean {
  return canaliWeb(cfg, modules).length > 0;
}

// Il rubinetto del sabato sera. Sospendere non spegne niente di configurato:
// la pagina resta in piedi e dice che stasera non si prende piu' — che e'
// un'altra cosa dal 404 di un locale che gli ordini web non li fa.
export function sospesoAdesso(
  fino: Date | null,
  adesso: Date = new Date()
): boolean {
  return !!fino && fino.getTime() > adesso.getTime();
}

// Fin quando dura la sospensione decisa adesso: la mezzanotte di stanotte.
// Non un numero di ore — "sospendi per due ore" alle 23 vuol dire riaperto
// all'una — e non "per sempre", che si trasforma in un locale chiuso al web
// per una settimana perche' nessuno si e' ricordato di riaprire.
export function fineGiornata(adesso: Date = new Date()): Date {
  return new Date(
    adesso.getFullYear(),
    adesso.getMonth(),
    adesso.getDate() + 1,
    0,
    0,
    0,
    0
  );
}

// --- Le fasce in cui si puo' ritirare ---------------------------------------

// Un ritiro all'ora esatta in cui si abbassa la serranda non esiste: qualcuno
// deve pur incartarlo e darglielo. Sta fisso perche' e' una regola del
// mestiere, non una preferenza del locale.
const MARGINE_CHIUSURA = 15;
export function fasceOrdinabili(
  orari: Calendario,
  giorno: Date,
  adesso: Date,
  cfg: ImpostazioniOrdiniWeb,
  canale: Channel
): string[] {
  const c = canaleDi(cfg, canale);
  return fasceOrarie(orari, giorno, adesso, {
    passo: c.passoMinuti,
    anticipo: c.preavvisoMinuti,
    margine: MARGINE_CHIUSURA,
  });
}

export function giorniOrdinabili(
  orari: Calendario,
  adesso: Date,
  cfg: ImpostazioniOrdiniWeb,
  canale: Channel
): Date[] {
  const c = canaleDi(cfg, canale);
  return giorniDisponibili(
    orari,
    adesso,
    // Una settimana di pillole: chi ordina una cena la ordina per oggi o per
    // domani, e un elenco piu' lungo e' solo roba da scorrere.
    7,
    {
      passo: c.passoMinuti,
      anticipo: c.preavvisoMinuti,
      margine: MARGINE_CHIUSURA,
    },
    c.giorniAvanti
  );
}

// Se una data sta dentro la finestra in cui il locale prende quel canale. Il
// ritiro puo' arrivare a stasera e la consegna a fra tre giorni: sono due
// finestre diverse, e guardarne una sola vorrebbe dire accettare un ordine che
// poi non trova nessuna fascia.
export function dentroOrizzonte(
  quando: Date,
  adesso: Date,
  cfg: ImpostazioniOrdiniWeb,
  canale: Channel
): boolean {
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate());
  const limite = new Date(
    oggi.getFullYear(),
    oggi.getMonth(),
    oggi.getDate() + canaleDi(cfg, canale).giorniAvanti,
    23,
    59
  );
  return quando >= oggi && quando <= limite;
}

export function istante(giorno: Date, ora: string): Date {
  const m = inMinuti(ora);
  return new Date(
    giorno.getFullYear(),
    giorno.getMonth(),
    giorno.getDate(),
    Math.floor(m / 60),
    m % 60
  );
}

// Il formato con cui l'ora concordata viaggia dentro l'ordine.
export function quandoScritto(quando: Date): string {
  const due = (n: number) => String(n).padStart(2, "0");
  return `${dataISO(quando)}T${due(quando.getHours())}:${due(quando.getMinutes())}`;
}

// --- La capienza della cucina -----------------------------------------------

// Gli ordini che pesano ancora sul forno. Uno gia' servito non pesa piu'; uno
// da accettare invece si', esattamente come una prenotazione ancora da
// confermare tiene occupato il tavolo — mentre il locale decide, quel posto non
// si puo' vendere due volte.
const STATI_VIVI = ["pending", "new", "preparing"];

export type Impegni = Map<number, number>;

type Esecutore = Pick<typeof db, "select">;

// Quanti pezzi sono gia' promessi in ogni fascia di un giorno.
//
// Si contano tutti gli ordini che hanno un orario, non solo quelli arrivati dal
// web: la cucina e' una sola, e l'asporto battuto in cassa occupa il forno
// quanto quello preso dal sito.
export async function pezziImpegnati(
  tenantId: string,
  giorno: Date,
  { esecutore = db }: { esecutore?: Esecutore } = {}
): Promise<Impegni> {
  const da = new Date(giorno.getFullYear(), giorno.getMonth(), giorno.getDate());
  const a = new Date(da.getFullYear(), da.getMonth(), da.getDate() + 1);

  const righe = await esecutore
    .select({
      quando: orders.dueAt,
      pezzi: sql<string>`sum(${orderItems.quantity})`,
    })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        inArray(orders.channel, ["asporto", "domicilio"]),
        gte(orders.dueAt, da),
        lt(orders.dueAt, a),
        inArray(orders.status, STATI_VIVI),
        // Una voce annullata non si prepara: non occupa niente.
        isNull(orderItems.voidedAt)
      )
    )
    .groupBy(orders.dueAt);

  const out: Impegni = new Map();
  for (const r of righe) {
    if (!r.quando) continue;
    out.set(r.quando.getTime(), Number(r.pezzi) || 0);
  }
  return out;
}

export function pezziDi(items: { quantity: number }[]): number {
  return items.reduce((s, i) => s + Math.max(0, Math.min(i.quantity, 99)), 0);
}

// Perche' un giorno non ha orari da proporre. Sono quattro risposte diverse per
// chi legge, e darne sempre una sola fa sembrare pieno un locale che quel
// giorno e' semplicemente chiuso.
export type MotivoVuoto = "oltre" | "chiuso" | "pieno" | "troppo-grande";

// Le fasce che tengono ancora questo carrello.
//
// Nella prenotazione la domanda e' "quante persone", qui e' "quanti pezzi": un
// ordine da trenta pizze vede meno orari di uno da due, ed e' giusto cosi' —
// sono le stesse trenta pizze che qualcuno deve infornare.
export function fasceLibere({
  fasce,
  impegnati,
  giorno,
  pezzi,
  tetto,
}: {
  fasce: string[];
  impegnati: Impegni;
  giorno: Date;
  pezzi: number;
  tetto: number;
}): string[] {
  if (tetto <= 0) return fasce;
  return fasce.filter((ora) => {
    const usati = impegnati.get(istante(giorno, ora).getTime()) ?? 0;
    return usati + pezzi <= tetto;
  });
}

// --- Quanto vale il carrello ------------------------------------------------

export type Carrello = { imponibileCents: number; pezzi: number };

export type EsitoCarrello =
  | { ok: true; carrello: Carrello }
  | { ok: false; errore: string };

// I prezzi si rileggono dal database, mai dal browser, e insieme al prezzo si
// controlla che quella roba da qui esca davvero: le stesse regole che applica
// `createOrderRows` quando scrive le righe. Servono prima, perche' e' su questo
// totale che si misurano il minimo d'ordine e la consegna offerta.
export async function valutaCarrello(
  tenantId: string,
  canale: Channel,
  items: IncomingItem[]
): Promise<EsitoCarrello> {
  const puliti = items.filter((i) => i.productId && i.quantity > 0);
  if (!puliti.length) return { ok: false, errore: "Il carrello è vuoto." };

  const ids = [...new Set(puliti.map((i) => i.productId))];
  const prods = await db
    .select({
      id: menuProducts.id,
      priceCents: menuProducts.priceCents,
      available: menuProducts.available,
      acceptsNote: menuProducts.acceptsNote,
      asporto: menuProducts.takeawayAvailable,
      domicilio: menuProducts.deliveryAvailable,
    })
    .from(menuProducts)
    .where(and(eq(menuProducts.tenantId, tenantId), inArray(menuProducts.id, ids)));
  const perId = new Map(prods.map((p) => [p.id, p]));

  const variantIds = puliti.map((i) => i.variantId).filter((v): v is string => !!v);
  const variants = variantIds.length
    ? await db
        .select({
          id: menuProductVariants.id,
          productId: menuProductVariants.productId,
          priceCents: menuProductVariants.priceCents,
          available: menuProductVariants.available,
        })
        .from(menuProductVariants)
        .where(
          and(
            eq(menuProductVariants.tenantId, tenantId),
            inArray(menuProductVariants.id, [...new Set(variantIds)])
          )
        )
    : [];
  const variantePerId = new Map(variants.map((v) => [v.id, v]));

  // Un solo messaggio per tutti i modi in cui una riga puo' non andare: al
  // cliente cambia niente sapere quale controllo non e' passato, e la cosa da
  // fare e' sempre la stessa — ricaricare e rifare il carrello.
  const scaduto = {
    ok: false as const,
    errore:
      "Qualcosa nel carrello non è più disponibile. Ricarica la pagina e riprova.",
  };

  let imponibileCents = 0;
  let pezzi = 0;

  for (const i of puliti) {
    const p = perId.get(i.productId);
    if (!p || !p.available) return scaduto;
    if (canale === "asporto" && !p.asporto) return scaduto;
    if (canale === "domicilio" && !p.domicilio) return scaduto;
    if (p.acceptsNote && !(i.note ?? "").trim()) return scaduto;

    const quantita = Math.min(i.quantity, 99);
    let prezzo = p.priceCents;

    if (i.variantId) {
      const v = variantePerId.get(i.variantId);
      if (!v || v.productId !== p.id || !v.available) return scaduto;
      prezzo = v.priceCents;
    }

    imponibileCents += prezzo * quantita;
    pezzi += quantita;
  }

  return { ok: true, carrello: { imponibileCents, pezzi } };
}

// --- Scrivere l'ordine ------------------------------------------------------

export type EsitoOrdineWeb =
  | { ok: true; token: string; stato: string }
  | { ok: false; errore: string };

// Scrive l'ordine controllando, nello stesso momento in cui lo scrive, che
// nella fascia ci sia ancora posto.
//
// Il lucchetto per locale e' lo stesso della prenotazione, e per lo stesso
// motivo: due persone possono premere "invia" nello stesso secondo, e senza
// lucchetto leggerebbero tutte e due la stessa fascia mezza vuota. Si apre da
// solo alla fine della transazione, comunque finisca, e stringe un locale alla
// volta.
export async function salvaOrdineWeb(input: {
  tenantId: string;
  canale: Channel;
  items: IncomingItem[];
  modules: ModuleState;
  cfg: ImpostazioniOrdiniWeb;
  quando: Date;
  pezzi: number;
  nome: string;
  telefono: string;
  email?: string | null;
  indirizzo?: string | null;
  consegnaCents: number;
  km: number | null;
  // Se l'ordine entra in cucina da solo. Lo decide il chiamante, che sa anche
  // le cose che qui non si vedono: una consegna di cui non si e' trovata la
  // distanza va guardata da una persona, per quanto il locale abbia acceso
  // l'accettazione automatica.
  automatica: boolean;
}): Promise<EsitoOrdineWeb> {
  const { tenantId, canale, cfg, quando, pezzi } = input;
  const token = randomBytes(9).toString("hex");
  const stato = input.automatica ? "new" : "pending";

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))`
    );

    if (cfg.pezziPerFascia > 0) {
      const impegnati = await pezziImpegnati(tenantId, quando, { esecutore: tx });
      const usati = impegnati.get(quando.getTime()) ?? 0;
      if (usati + pezzi > cfg.pezziPerFascia) {
        return {
          ok: false as const,
          errore:
            "Quell'orario si è appena riempito. Scegline un altro: l'elenco qui sopra è già aggiornato.",
        };
      }
    }

    const esito = await createOrderRows(
      tenantId,
      null,
      input.items,
      input.modules,
      {
        channel: canale,
        cliente: {
          nome: input.nome,
          telefono: input.telefono,
          email: input.email ?? undefined,
          indirizzo: input.indirizzo ?? undefined,
          consegnaCents: input.consegnaCents,
          oraRitiro: quandoScritto(quando),
        },
        stato,
        webToken: token,
        deliveryKm: input.km,
        // La comanda di un ordine da accettare non parte: in cucina ci va
        // quando qualcuno l'ha guardato. Con l'accettazione automatica invece
        // decide l'impostazione del canale, come per ogni altro ordine.
        stampaComanda: stato === "pending" ? false : undefined,
        esecutore: tx,
      }
    );

    if (!esito.ok) {
      return {
        ok: false as const,
        errore:
          "Qualcosa nel carrello non è più disponibile. Ricarica la pagina e riprova.",
      };
    }

    return { ok: true as const, token, stato };
  });
}

// --- Il locale che sta rispondendo ------------------------------------------

// Quello che serve alla pagina pubblica e alle sue azioni. Come per la
// prenotazione entrambe partono dal sottodominio: nessuna delle due si fida di
// un identificativo arrivato dal browser.
export type ContestoOrdineWeb = {
  tenantId: string;
  nome: string;
  logoUrl: string | null;
  telefono: string | null;
  indirizzo: string | null;
  orari: Calendario;
  cfg: ImpostazioniOrdiniWeb;
  canali: Channel[];
  modules: ModuleState;
  fasce: FasciaConsegna[];
  gratisSopraCents: number;
  // Quando il locale ha chiuso il rubinetto per stasera. Null = si ordina.
  sospesoFino: Date | null;
  // Se il locale ha la posta configurata. Con la mail attiva l'indirizzo del
  // cliente diventa obbligatorio: e' il modo in cui gli arriva la conferma, e
  // chiederlo "se vuoi" vorrebbe dire prometterla e non mandarla.
  mailAttiva: boolean;
  // La riga «Ordina con Comanda» in fondo: e' la stessa spunta del menu
  // (`tenants.menu_branding`), perche' e' la stessa firma sullo stesso sito.
  marchio: boolean;
};

export async function contestoOrdineWeb(): Promise<ContestoOrdineWeb | null> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) return null;

  const modules = await getTenantModules(tenant.id);

  const [row] = await db
    .select({
      phone: tenants.phone,
      address: tenants.address,
      city: tenants.city,
      openingHours: tenants.openingHours,
      closureDays: tenants.closureDays,
      webOrderChannels: tenants.webOrderChannels,
      webOrderPiecesPerSlot: tenants.webOrderPiecesPerSlot,
      webOrdersPausedUntil: tenants.webOrdersPausedUntil,
      deliveryBands: tenants.deliveryBands,
      deliveryFreeOverCents: tenants.deliveryFreeOverCents,
      smtpHost: tenants.smtpHost,
      smtpUser: tenants.smtpUser,
      smtpPass: tenants.smtpPass,
      menuBranding: tenants.menuBranding,
    })
    .from(tenants)
    .where(eq(tenants.id, tenant.id))
    .limit(1);
  if (!row) return null;

  const cfg = leggiImpostazioniWeb(row);
  const canali = canaliWeb(cfg, modules);
  // Nessun canale acceso: la pagina non esiste, e risponde 404 come qualsiasi
  // indirizzo inventato.
  if (!canali.length) return null;

  return {
    tenantId: tenant.id,
    nome: tenant.name,
    logoUrl: tenant.logoUrl,
    telefono: row.phone,
    indirizzo: [row.address, row.city].filter(Boolean).join(", ") || null,
    orari: leggiCalendario(row.openingHours, row.closureDays),
    cfg,
    canali,
    modules,
    fasce: leggiFasce(row.deliveryBands),
    gratisSopraCents: row.deliveryFreeOverCents,
    sospesoFino: sospesoAdesso(row.webOrdersPausedUntil)
      ? row.webOrdersPausedUntil
      : null,
    mailAttiva: !!(row.smtpHost && row.smtpUser && row.smtpPass),
    marchio: row.menuBranding,
  };
}

export { dataISO };

// --- L'ordine che il cliente ritrova col suo link ---------------------------

export type VoceOrdine = {
  nome: string;
  quantita: number;
  prezzoCents: number;
  note: string | null;
  annullata: boolean;
};

export type OrdineWeb = {
  id: string;
  // A che punto e', dal punto di vista di chi aspetta.
  fase: FaseOrdine;
  readyAt: Date | null;
  outAt: Date | null;
  // Il suo link pubblico. Nullo su quello che nasce dentro al locale.
  token: string | null;
  canale: Channel;
  stato: string;
  quando: Date | null;
  nome: string | null;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  consegnaCents: number;
  km: number | null;
  voci: VoceOrdine[];
  totaleCents: number;
  creatoIl: Date;
};

// Il token non e' un accesso al locale: e' l'unica chiave di **quell'** ordine.
// Si cerca sempre dentro il tenant del sottodominio, cosi' un link di un locale
// non apre niente sul sito di un altro.
export async function ordinePerToken(
  tenantId: string,
  token: string
): Promise<OrdineWeb | null> {
  if (!/^[a-f0-9]{6,64}$/.test(token)) return null;

  const [o] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.webToken, token)))
    .limit(1);
  if (!o) return null;

  const voci = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, o.id));

  const righe: VoceOrdine[] = voci.map((v) => ({
    nome: v.name,
    quantita: v.quantity,
    prezzoCents: v.priceCents,
    note: v.note,
    annullata: !!v.voidedAt,
  }));

  // Le voci annullate restano scritte ma non si pagano: il totale cambierebbe
  // sotto gli occhi del cliente senza una spiegazione.
  const totaleCents =
    righe
      .filter((r) => !r.annullata)
      .reduce((s, r) => s + r.prezzoCents * r.quantita, 0) + o.deliveryFeeCents;

  const canale = ((o.channel as Channel) ?? "asporto") as Channel;

  return {
    id: o.id,
    fase: faseDi({
      stato: o.status,
      canale,
      readyAt: o.readyAt,
      outAt: o.outAt,
    }),
    readyAt: o.readyAt,
    outAt: o.outAt,
    token: o.webToken,
    canale,
    stato: o.status,
    quando: o.dueAt,
    nome: o.customerName,
    telefono: o.customerPhone,
    email: o.customerEmail,
    indirizzo: o.customerAddress,
    consegnaCents: o.deliveryFeeCents,
    km: o.deliveryKm,
    voci: righe,
    totaleCents,
    creatoIl: o.createdAt,
  };
}

// --- A che punto e' l'ordine ------------------------------------------------
//
// Lo stato a database dice cosa ne fa la cucina; questo dice cosa ne sa il
// cliente, che e' un'altra cosa. "In preparazione" e "pronto" per la cucina
// sono lo stesso ordine ancora aperto; per chi aspetta sono la differenza fra
// mettersi le scarpe e restare seduto.

export type FaseOrdine =
  | "ricevuto"
  | "confermato"
  | "preparazione"
  | "pronto"
  | "in-consegna"
  | "chiuso"
  | "rifiutato";

export function faseDi(o: {
  stato: string;
  canale: Channel;
  readyAt: Date | null;
  outAt: Date | null;
}): FaseOrdine {
  if (o.stato === "rejected") return "rifiutato";
  if (o.stato === "served") return "chiuso";
  // I due momenti segnati a mano vincono sullo stato: uno gia' uscito e' piu'
  // avanti di uno "in preparazione", per quanto le sue righe dicano altro.
  if (o.outAt) return "in-consegna";
  if (o.readyAt) return "pronto";
  if (o.stato === "preparing") return "preparazione";
  if (o.stato === "pending") return "ricevuto";
  return "confermato";
}

// L'ora concordata cambiata a mano da chi accetta l'ordine.
//
// Arriva come istante intero — "+15" e un orario battuto nel campo sono la
// stessa cosa — e qui si controlla che sia un'ora e che sia ancora questo
// ordine: oltre le dodici ore di distanza non e' piu' uno spostamento ma un
// altro appuntamento, che al cliente va detto a voce. Meglio fermarsi e dirlo
// che accettare di nascosto all'ora vecchia, perche' quella e' la conferma
// che fa arrivare la gente quando il locale non l'aspetta.
export type OraSpostata =
  // `quando` a null vuol dire "e' la stessa ora": si accetta e basta, senza
  // mandare al cliente l'avviso di un cambio che non c'e' stato.
  | { ok: true; quando: Date | null }
  | { ok: false; errore: string };

export const SPOSTAMENTO_MASSIMO_MS = 12 * 60 * 60 * 1000;

export function oraSpostata(
  concordata: Date | null,
  scritta: string
): OraSpostata {
  const d = new Date(scritta);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, errore: "Quell'ora non si legge. Riprova." };
  }
  if (!concordata) {
    return {
      ok: false,
      errore: "Questo ordine non ha un'ora concordata: non c'è niente da spostare.",
    };
  }
  if (Math.abs(d.getTime() - concordata.getTime()) > SPOSTAMENTO_MASSIMO_MS) {
    return {
      ok: false,
      errore: "Troppo lontano dall'ora concordata: chiama il cliente.",
    };
  }
  return { ok: true, quando: d.getTime() === concordata.getTime() ? null : d };
}

// I due momenti che il cliente aspetta di vedere, scritti sull'ordine.
//
// Stanno qui e non nell'azione perche' l'azione ha la sessione da controllare,
// e questi due UPDATE vanno provati senza: sono passati davanti al cliente,
// e un errore che salta fuori solo premendo il tasto in cassa e' un errore che
// scopre il locale.
//
// Tornano il token dell'ordine — quello con cui si avvisa chi aspetta — o
// `null` quando non c'era niente da cambiare.
export async function segnaProntoOrdine(
  tenantId: string,
  orderId: string,
  pronto: boolean
): Promise<{ ok: boolean; token: string | null }> {
  const cambiati = await db
    .update(orders)
    .set({
      readyAt: pronto ? new Date() : null,
      // Tornando indietro cade anche l'uscita: un ordine "partito ma non
      // pronto" e' uno stato che non esiste.
      ...(pronto ? {} : { outAt: null }),
    })
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .returning({ webToken: orders.webToken });

  if (!cambiati.length) return { ok: false, token: null };
  return { ok: true, token: cambiati[0].webToken };
}

export async function segnaPartitoOrdine(
  tenantId: string,
  orderId: string
): Promise<{ ok: boolean; token: string | null }> {
  const cambiati = await db
    .update(orders)
    .set({
      // Le due ore le batte l'orologio del database, non quello del server:
      // se «e' partito» viene premuto senza passare da «e' pronto», l'ora
      // ripiega su quella di adesso, e le due devono uscire dallo stesso
      // orologio o si rischia un'uscita precedente al pronto.
      outAt: sql`now()`,
      readyAt: sql`coalesce(${orders.readyAt}, now())`,
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.tenantId, tenantId),
        // Un asporto non esce con nessuno: il tasto non c'e', e se arriva
        // lo stesso non si scrive niente.
        eq(orders.channel, "domicilio")
      )
    )
    .returning({ webToken: orders.webToken });

  if (!cambiati.length) return { ok: false, token: null };
  return { ok: true, token: cambiati[0].webToken };
}

// Le fasi che questo canale attraversa davvero: un asporto non esce con
// nessuno, e mostrare "in consegna" a chi passa a ritirare e' una tappa che
// non arrivera' mai.
export function fasiDelCanale(canale: Channel): FaseOrdine[] {
  return canale === "domicilio"
    ? ["ricevuto", "confermato", "preparazione", "pronto", "in-consegna", "chiuso"]
    : ["ricevuto", "confermato", "preparazione", "pronto", "chiuso"];
}

// Il locale visto dalla sua pagina pubblica, senza chiedere che venda ancora
// dal sito.
//
// Serve alla pagina di un ordine gia' fatto: il locale puo' spegnere l'asporto
// dal web alle 23:00, e chi ha ordinato alle 22:30 deve continuare a vedere a
// che punto e' il suo. Legare quella pagina ai canali accesi vorrebbe dire
// spegnere in faccia ai clienti i link che stanno guardando.
export type LocaleDelSito = {
  tenantId: string;
  nome: string;
  logoUrl: string | null;
  telefono: string | null;
  indirizzo: string | null;
  marchio: boolean;
};

export async function localeDalSito(): Promise<LocaleDelSito | null> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended || tenant.serviceBlocked) return null;

  const [row] = await db
    .select({
      phone: tenants.phone,
      menuBranding: tenants.menuBranding,
      address: tenants.address,
      city: tenants.city,
    })
    .from(tenants)
    .where(eq(tenants.id, tenant.id))
    .limit(1);

  return {
    tenantId: tenant.id,
    nome: tenant.name,
    logoUrl: tenant.logoUrl,
    telefono: row?.phone ?? null,
    indirizzo:
      [row?.address, row?.city].filter(Boolean).join(", ") || null,
    marchio: row?.menuBranding ?? true,
  };
}

// Come si chiama ogni fase quando la si dice al cliente in una parola sola.
export const ETICHETTA_FASE: Record<FaseOrdine, string> = {
  ricevuto: "Da confermare",
  confermato: "Confermato",
  preparazione: "In preparazione",
  pronto: "Pronto",
  "in-consegna": "In consegna",
  chiuso: "Chiuso",
  rifiutato: "Rifiutato",
};

// Dove il sito si ricorda l'ultimo ordine fatto da questo telefono. Il dominio
// e' gia' quello del locale, quindi il nome non ha bisogno dello slug.
//
// Sta qui e non fra le azioni: un file "use server" puo' esportare solo
// funzioni asincrone, e una costante li' dentro fa esplodere ogni pagina che la
// importa — con un errore che parla di "use server" e non dice quale.
export const NOME_COOKIE = "ordine";
