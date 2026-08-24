import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { geolocalizza } from "@/lib/indirizzi";

// Fin dove si consegna e quanto costa arrivarci.
//
// Il costo esce dalla distanza e non dal CAP, che dice poco: due indirizzi
// dello stesso CAP possono stare a un chilometro o a sei, e "fuori CAP" non
// vuol dire "lontano". Le fasce sono una lista di righe "fino a X km": una
// riga sola e' il costo fisso, tre righe sono il prezzo che cresce con la
// strada, e oltre l'ultima non si consegna.
//
// Il numero lo calcola sempre il server, mai il browser: qui si decide quanto
// paga il cliente, e un campo che arriva dal telefono e' un campo che si mette
// a zero da soli.

export type Punto = { lat: number; lon: number };

export type FasciaConsegna = {
  // Il limite superiore della fascia, in chilometri.
  kmFino: number;
  costoCents: number;
  // Sotto questa spesa (senza la consegna) non si esce.
  minimoCents: number;
};

// Piu' di sei righe non e' un listino, e' una tabella: chi ordina deve capire
// quanto paga guardandola una volta.
const MAX_FASCE = 6;
// Oltre i cinquanta chilometri non e' piu' una consegna. E il costo si ferma
// dove si ferma quello che l'ordine puo' accettare (lib/order-create.ts).
const MAX_KM = 50;
const MAX_COSTO = 5000;
const MAX_MINIMO = 100000;

// Ripulisce quello che arriva dal modulo e quello che si rilegge da jsonb.
// Una riga storta qui dentro non da' errore: diventa una zona in cui non si
// consegna, o una che si consegna gratis, e il locale se ne accorge dal
// fattorino che torna senza soldi.
export function leggiFasce(raw: unknown): FasciaConsegna[] {
  if (!Array.isArray(raw)) return [];

  const num = (x: unknown): number => {
    const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
    return Number.isFinite(n) ? n : NaN;
  };

  const viste = new Set<number>();
  const out: FasciaConsegna[] = [];

  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Partial<Record<keyof FasciaConsegna, unknown>>;

    // Mezzo chilometro e' il passo piu' fine che ha senso: sotto, la distanza
    // stimata non e' piu' precisa del confine che si sta tracciando.
    const km = Math.round(num(r.kmFino) * 2) / 2;
    if (!(km > 0) || km > MAX_KM) continue;
    if (viste.has(km)) continue;

    const costo = Math.round(num(r.costoCents));
    const minimo = Math.round(num(r.minimoCents));
    if (!Number.isFinite(costo) || costo < 0 || costo > MAX_COSTO) continue;

    viste.add(km);
    out.push({
      kmFino: km,
      costoCents: costo,
      minimoCents:
        Number.isFinite(minimo) && minimo > 0
          ? Math.min(minimo, MAX_MINIMO)
          : 0,
    });
  }

  return out.sort((a, b) => a.kmFino - b.kmFino).slice(0, MAX_FASCE);
}

// Fin dove arriva il fattorino: e' l'ultima fascia, e senza fasce non si
// consegna da nessuna parte.
export function raggioMassimo(fasce: FasciaConsegna[]): number {
  return fasce.length ? fasce[fasce.length - 1].kmFino : 0;
}

export function fasciaPer(
  fasce: FasciaConsegna[],
  km: number
): FasciaConsegna | null {
  return fasce.find((f) => km <= f.kmFino) ?? null;
}

// --- Distanza ---------------------------------------------------------------

const RAGGIO_TERRA = 6371;

// La distanza in linea d'aria. E' quella che si sa senza chiedere niente a
// nessuno: non costa, non puo' non rispondere, e non lascia il cliente fermo
// su un carrello mentre un servizio esterno ci pensa.
export function distanzaAria(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAGGIO_TERRA * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Le strade non vanno in linea retta: si gira intorno agli isolati, si prende
// il senso unico, si passa dal ponte. Il 30% in piu' e' lo scarto medio fra
// l'aria e l'asfalto in citta', e serve a far somigliare i chilometri che il
// locale scrive nelle fasce a quelli che fa davvero il fattorino.
//
// Dove l'aria mente sul serio — il fiume, la tangenziale, la collina — non lo
// aggiusta nessun fattore: lo aggiusta chi accetta l'ordine, che vede la
// distanza scritta e puo' correggere il costo o rifiutare.
export const FATTORE_STRADA = 1.3;

export function kmStimati(a: Punto, b: Punto): number {
  return Math.round(distanzaAria(a, b) * FATTORE_STRADA * 10) / 10;
}

// La distanza su strada vera, per chi la vuole. Si accende con GEO_ROUTING e
// costa una chiamata per ordine — non per tasto premuto — quindi la fa solo
// chi ha deciso di pagarla. Se non risponde si torna alla stima: meglio un
// numero un po' storto che un cliente fermo sul carrello.
async function osrm(a: Punto, b: Punto): Promise<number | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { routes?: { distance?: number }[] };
    const metri = d.routes?.[0]?.distance;
    if (typeof metri !== "number" || !Number.isFinite(metri)) return null;
    return Math.round((metri / 1000) * 10) / 10;
  } catch {
    return null;
  }
}

export async function kmDaPercorrere(a: Punto, b: Punto): Promise<number> {
  if ((process.env.GEO_ROUTING ?? "") === "osrm") {
    const strada = await osrm(a, b);
    if (strada !== null) return strada;
  }
  return kmStimati(a, b);
}

// --- Il costo ---------------------------------------------------------------

export type EsitoConsegna =
  | { ok: true; km: number; costoCents: number; fascia: FasciaConsegna }
  // Il locale non ha ancora scritto nessuna zona: non e' colpa del cliente, e
  // non gli si dice "fuori zona" — non c'e' nessuna zona.
  | { ok: false; motivo: "nessuna-zona" }
  // L'indirizzo non si e' trovato sulla mappa. L'ordine si prende lo stesso e
  // il costo lo conferma il locale: rifiutare una vendita perche' un geocoder
  // non ha risposto e' il modo peggiore di perdere un cliente.
  | { ok: false; motivo: "distanza-sconosciuta" }
  | { ok: false; motivo: "fuori-zona"; km: number; kmMassimi: number }
  | {
      ok: false;
      motivo: "sotto-minimo";
      km: number;
      minimoCents: number;
      mancanoCents: number;
    };

export function costoConsegna({
  fasce,
  km,
  imponibileCents,
  gratisSopraCents = 0,
  minimoCanaleCents = 0,
}: {
  fasce: FasciaConsegna[];
  // Nullo quando l'indirizzo non si e' trovato sulla mappa.
  km: number | null;
  // Quanto vale l'ordine senza la consegna: e' su questo che si misurano il
  // minimo e la soglia della consegna offerta.
  imponibileCents: number;
  gratisSopraCents?: number;
  // Il minimo che il locale ha messo sulla consegna in generale. Vale insieme
  // a quello della zona, e fra i due comanda il piu' alto: uno e' la regola
  // del locale, l'altro quella di quella strada.
  minimoCanaleCents?: number;
}): EsitoConsegna {
  if (!fasce.length) return { ok: false, motivo: "nessuna-zona" };
  if (km === null) return { ok: false, motivo: "distanza-sconosciuta" };

  const fascia = fasciaPer(fasce, km);
  if (!fascia) {
    return {
      ok: false,
      motivo: "fuori-zona",
      km,
      kmMassimi: raggioMassimo(fasce),
    };
  }

  const minimo = Math.max(fascia.minimoCents, minimoCanaleCents);
  if (imponibileCents < minimo) {
    return {
      ok: false,
      motivo: "sotto-minimo",
      km,
      minimoCents: minimo,
      mancanoCents: minimo - imponibileCents,
    };
  }

  // La consegna offerta si guarda per ultima: il minimo d'ordine vale lo
  // stesso, e chi spende quaranta euro a venti chilometri resta fuori zona.
  const gratis = gratisSopraCents > 0 && imponibileCents >= gratisSopraCents;

  return {
    ok: true,
    km,
    costoCents: gratis ? 0 : fascia.costoCents,
    fascia,
  };
}

// --- Dove sta il locale -----------------------------------------------------

// Le coordinate del locale, ricavate una volta sola dall'indirizzo e salvate.
//
// Senza queste non si calcola nessuna distanza, quindi nessun costo di
// consegna: e' il primo pezzo che deve esserci. Si cerca solo quando mancano —
// una volta nella vita del locale — perche' e' una chiamata a un servizio
// esterno, e ripeterla a ogni ordine vorrebbe dire pagare un geocoder per
// sapere una cosa che non cambia mai.
export async function coordinateLocale(tenantId: string): Promise<Punto | null> {
  const [locale] = await db
    .select({
      indirizzo: tenants.address,
      citta: tenants.city,
      provincia: tenants.province,
      lat: tenants.latitude,
      lon: tenants.longitude,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!locale) return null;

  if (locale.lat != null && locale.lon != null) {
    return { lat: locale.lat, lon: locale.lon };
  }
  if (!locale.indirizzo && !locale.citta) return null;

  const dove = await geolocalizza(
    [locale.indirizzo, locale.citta, locale.provincia, "Italia"]
      .filter(Boolean)
      .join(", ")
  );
  if (!dove) return null;

  await db
    .update(tenants)
    .set({ latitude: dove.lat, longitude: dove.lon })
    .where(eq(tenants.id, tenantId));
  return dove;
}

// Quanto dista da qui un indirizzo scritto dal cliente. Torna null quando
// l'indirizzo non si trova: chi chiama decide cosa farne, e la risposta giusta
// non e' mai buttare via l'ordine.
export async function distanzaDaLocale(
  tenantId: string,
  indirizzo: string
): Promise<number | null> {
  if (!indirizzo.trim()) return null;
  const qui = await coordinateLocale(tenantId);
  if (!qui) return null;

  // La ricerca si sposta intorno al locale: l'indirizzo del cliente e' quasi
  // sempre a pochi chilometri, e la stessa via esiste in dieci comuni qui
  // intorno.
  const la = await geolocalizza(indirizzo, qui);
  if (!la) return null;

  return kmDaPercorrere(qui, la);
}
