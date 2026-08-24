import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, reviews, testimonials, tenants } from "@/lib/db/schema";

// Com'e' andata: la domanda che si fa a cose fatte, e le due risposte diverse
// che si possono ricevere.
//
// Sono due cose con due padroni. Quella sul locale e' del locale: gli serve per
// accorgersi che la carbonara di venerdi' non andava, prima che quella frase
// finisca su Google. Quella su Comanda e' mia, e serve alla vetrina.
//
// Due regole che valgono per tutte e due, e non sono opinioni:
//
//   1. Il link al profilo pubblico (Google, Trustpilot) si mostra a *chiunque*,
//      qualunque voto abbia dato. Mandarci solo i contenti e tenersi le
//      lamentele in casa si chiama review gating, ed e' vietato dalle regole
//      di tutte e due le piattaforme.
//   2. Una recensione non si scrive mai al posto del cliente. Su Google non
//      esiste nemmeno il modo — l'API della scheda le fa leggere e rispondere,
//      non scrivere — e comunque sarebbe una recensione falsa: pratica
//      commerciale scorretta, non una scorciatoia.
//
// Chiedere non e' obbligare: la domanda e' una riga, si salta, e chi non
// risponde non se la ritrova davanti al giro dopo.

/** Il voto piu' basso e il piu' alto. Cinque stelle, come le legge chiunque. */
export const VOTO_MIN = 1;
export const VOTO_MAX = 5;
const MAX_TESTO = 600;
const MAX_FIRMA = 60;

export function votoValido(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= VOTO_MIN &&
    v <= VOTO_MAX
  );
}

function pulisci(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.trim().slice(0, max) || null : null;
}

// Come si chiama il posto dove porta il link, letto dall'indirizzo. Serve solo
// a scrivere «Lasciala anche su Google» invece di «sul profilo del locale»:
// una frase che nomina la cosa la si legge, una generica no.
export function dovePorta(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("google")) return "Google";
    if (host.includes("trustpilot")) return "Trustpilot";
    if (host.includes("tripadvisor")) return "TripAdvisor";
    if (host.includes("facebook")) return "Facebook";
    if (host.includes("thefork")) return "TheFork";
    return host;
  } catch {
    return null;
  }
}

// Solo http/https, e solo un indirizzo che sta in piedi: quello che il locale
// incolla qui finisce in un link davanti ai suoi clienti, e un "javascript:"
// incollato per sbaglio o per dispetto non deve poterci arrivare.
export function linkRecensioni(v: unknown): string | null {
  const raw = pulisci(v, 500);
  if (!raw) return null;
  const con = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(con);
    return u.protocol === "http:" || u.protocol === "https:"
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}

export type ChiedereRecensione = {
  // Se la domanda va fatta: il locale l'ha accesa e quell'ordine non ne ha
  // gia' una.
  chiedi: boolean;
  // Il profilo pubblico, se ce n'e' uno, e come si chiama.
  url: string | null;
  dove: string | null;
};

// Se a questo ordine si puo' chiedere com'e' andata.
//
// Una per ordine, e mai due volte allo stesso: chi ha gia' risposto trova la
// sua risposta, non di nuovo la domanda.
export async function daChiedere(
  tenantId: string,
  orderId: string
): Promise<ChiedereRecensione> {
  const [riga] = await db
    .select({
      acceso: tenants.reviewsEnabled,
      url: tenants.reviewUrl,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!riga?.acceso) return { chiedi: false, url: null, dove: null };

  const [gia] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(eq(reviews.orderId, orderId))
    .limit(1);

  const url = riga.url ?? null;
  return { chiedi: !gia, url, dove: dovePorta(url) };
}

export type EsitoRecensione = { ok: true } | { ok: false; errore: string };

// La recensione del locale. Legata all'ordine, una sola: e' quello che la
// rende verificata, ed e' anche il motivo per cui non serve chiedere chi sei.
export async function salvaRecensione(input: {
  tenantId: string;
  orderId: string;
  canale: string;
  voto: number;
  testo?: unknown;
}): Promise<EsitoRecensione> {
  if (!votoValido(input.voto)) {
    return { ok: false, errore: "Scegli da una a cinque stelle." };
  }

  // L'ordine dev'essere di questo locale: il token e il numero di tavolo
  // arrivano dal browser, e da li' non arriva mai una chiave di casa d'altri.
  const [suo] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(eq(orders.id, input.orderId), eq(orders.tenantId, input.tenantId))
    )
    .limit(1);
  if (!suo) return { ok: false, errore: "Ordine non trovato." };

  // Due invii dello stesso modulo — il dito che tocca due volte, la pagina
  // ricaricata — non sono due recensioni: il secondo non fa niente e non e'
  // un errore da mostrare.
  await db
    .insert(reviews)
    .values({
      tenantId: input.tenantId,
      orderId: input.orderId,
      channel: input.canale,
      rating: input.voto,
      comment: pulisci(input.testo, MAX_TESTO),
    })
    .onConflictDoNothing({ target: reviews.orderId });

  return { ok: true };
}

// La riga su Comanda, che finisce in vetrina solo se chi l'ha scritta ha detto
// di si'. Il consenso si registra con la data e col testo approvato in quel
// momento: senza quei due, un giorno non si sa piu' a cosa aveva detto di si'.
export async function salvaTestimonianza(input: {
  tenantId: string | null;
  nomeLocale: string | null;
  ruolo: "cliente" | "gestore";
  voto: number;
  testo?: unknown;
  firma?: unknown;
  pubblicabile: boolean;
}): Promise<EsitoRecensione> {
  if (!votoValido(input.voto)) {
    return { ok: false, errore: "Scegli da una a cinque stelle." };
  }
  const testo = pulisci(input.testo, MAX_TESTO);

  await db.insert(testimonials).values({
    tenantId: input.tenantId,
    tenantName: input.nomeLocale,
    role: input.ruolo,
    rating: input.voto,
    comment: testo,
    signature: input.pubblicabile ? pulisci(input.firma, MAX_FIRMA) : null,
    // Il permesso vale su quello che c'era scritto quando l'ha dato. Se il
    // testo e' vuoto non c'e' niente da pubblicare, e nemmeno da consentire.
    consentAt: input.pubblicabile && testo ? new Date() : null,
    consentText: input.pubblicabile && testo ? testo : null,
  });

  return { ok: true };
}

export type RecensioneLetta = {
  id: string;
  voto: number;
  testo: string | null;
  canale: string;
  quando: Date;
  letta: boolean;
  nome: string | null;
};

// Quelle del locale, per la sua dashboard. Le ultime in cima: una recensione
// di tre mesi fa non e' una cosa su cui intervenire.
export async function recensioniDelLocale(
  tenantId: string,
  quante = 50
): Promise<RecensioneLetta[]> {
  const righe = await db
    .select({
      id: reviews.id,
      voto: reviews.rating,
      testo: reviews.comment,
      canale: reviews.channel,
      quando: reviews.createdAt,
      letta: reviews.readAt,
      nome: orders.customerName,
    })
    .from(reviews)
    .leftJoin(orders, eq(orders.id, reviews.orderId))
    .where(eq(reviews.tenantId, tenantId))
    .orderBy(desc(reviews.createdAt))
    .limit(quante);

  return righe.map((r) => ({
    id: r.id,
    voto: r.voto,
    testo: r.testo,
    canale: r.canale,
    quando: r.quando,
    letta: !!r.letta,
    nome: r.nome,
  }));
}

export type RiassuntoRecensioni = {
  quante: number;
  media: number;
  daLeggere: number;
};

export async function riassuntoRecensioni(
  tenantId: string
): Promise<RiassuntoRecensioni> {
  const [r] = await db
    .select({
      quante: sql<number>`count(*)::int`,
      media: sql<number>`coalesce(avg(${reviews.rating}), 0)::float`,
      daLeggere: sql<number>`count(*) filter (where ${reviews.readAt} is null)::int`,
    })
    .from(reviews)
    .where(eq(reviews.tenantId, tenantId));

  return {
    quante: r?.quante ?? 0,
    media: r?.media ?? 0,
    daLeggere: r?.daLeggere ?? 0,
  };
}

// Segna lette quelle che il locale ha appena guardato. Non le nasconde: toglie
// solo il pallino, che e' un promemoria e non un archivio.
export async function segnaLette(tenantId: string): Promise<void> {
  await db
    .update(reviews)
    .set({ readAt: new Date() })
    .where(and(eq(reviews.tenantId, tenantId), isNull(reviews.readAt)));
}

// --- La testimonianza del gestore -------------------------------------------
//
// Quella che conta per la vetrina. Un cliente racconta com'e' stato ordinare —
// «comodo, non ho telefonato» — e fa volume; un gestore racconta com'e'
// lavorarci, e quello e' cio' che convince un altro gestore.
//
// Si chiede una volta sola e non subito: al primo giorno non ha ancora niente
// da dire, e chiederglielo mentre sta imparando dove sono i tasti e' il modo
// piu' veloce di prendersi un no.

/** Prima di questo non si chiede niente: non ha ancora nulla da raccontare. */
export const GIORNI_PRIMA_DI_CHIEDERE = 30;

export async function chiediAlGestore(
  tenantId: string,
  { adesso = new Date() }: { adesso?: Date } = {}
): Promise<boolean> {
  const [locale] = await db
    .select({ nato: tenants.createdAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!locale) return false;

  const giorni =
    (adesso.getTime() - locale.nato.getTime()) / (24 * 60 * 60 * 1000);
  if (giorni < GIORNI_PRIMA_DI_CHIEDERE) return false;

  // Gia' risposto: non si richiede. Una richiesta che torna e' una richiesta
  // che si impara a chiudere senza leggerla.
  const [gia] = await db
    .select({ id: testimonials.id })
    .from(testimonials)
    .where(
      and(eq(testimonials.tenantId, tenantId), eq(testimonials.role, "gestore"))
    )
    .limit(1);

  return !gia;
}

// Dove la dashboard si segna che il gestore ha detto «non adesso». Sta qui e
// non fra le azioni perche' un file "use server" puo' esportare solo funzioni
// asincrone: una costante li' dentro fa esplodere ogni pagina che la importa.
export const COOKIE_RIMANDA = "testimonianza-rimandata";
