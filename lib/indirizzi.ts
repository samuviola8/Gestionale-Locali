// Ricerca di indirizzi per la consegna a domicilio.
//
// La chiamata passa sempre dal nostro server e mai dal browser: la chiave del
// servizio non deve finire nel sorgente della pagina, e da qui si possono
// limitare le richieste invece di pagarne una per ogni tasto premuto.
//
// Il fornitore si sceglie da variabile d'ambiente, cosi' un locale che fa
// consegne sul serio puo' passare a un servizio a pagamento senza toccare il
// codice.

export type Suggerimento = {
  // Riga completa da mostrare e salvare.
  testo: string;
  // Solo la via, senza numero: il civico viaggia a parte perche' e' la cosa
  // che si perde piu' facilmente, ed e' quella senza cui il fattorino gira a
  // vuoto. Tenerli separati rende impossibile smarrirlo.
  via: string;
  civico: string | null;
  // Seconda riga: cap e comune.
  dettaglio: string;
};

export function componiIndirizzo(
  via: string,
  civico: string,
  dettaglio: string
): string {
  const strada = [via.trim(), civico.trim()].filter(Boolean).join(" ");
  return [strada, dettaglio.trim()].filter(Boolean).join(", ");
}

type Contesto = {
  // Dove sta il locale: i risultati vicini vengono prima, perche' una consegna
  // e' quasi sempre nel raggio di pochi chilometri. Sono coordinate e non il
  // nome della citta': infilare la citta' nel testo cercato fa dare retta a
  // quella e buttare via la via che si sta scrivendo.
  lat?: number | null;
  lon?: number | null;
};

const PROVIDER = process.env.GEO_PROVIDER ?? "photon";
const CHIAVE = process.env.GEO_API_KEY ?? "";

async function photon(q: string, ctx: Contesto): Promise<Suggerimento[]> {
  // Photon e' l'unico che risponde senza chiave: serve a far funzionare la
  // cosa da subito. E' un servizio pubblico gratuito, senza garanzie: prima di
  // andare in produzione conviene una chiave di un fornitore con un contratto.
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "10");
  if (ctx.lat != null && ctx.lon != null) {
    url.searchParams.set("lat", String(ctx.lat));
    url.searchParams.set("lon", String(ctx.lon));
  }
  // Niente `lang`: Photon accetta solo poche lingue e con "it" risponde 400.
  // Senza, i nomi arrivano comunque in italiano perche' li prende da OSM.

  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return [];
  const d = (await r.json()) as {
    features?: { properties?: Record<string, string> }[];
  };

  return (d.features ?? [])
    .map((f) => f.properties ?? {})
    .filter((p) => p.countrycode === "IT")
    .map((p) => {
      const via = p.street ?? p.name ?? "";
      const civico = p.housenumber ?? null;
      const dettaglio = [p.postcode, p.city ?? p.county].filter(Boolean).join(" ");
      return {
        via,
        civico,
        dettaglio,
        testo: componiIndirizzo(via, civico ?? "", dettaglio),
      };
    })
    .filter((s) => s.via);
}

async function geoapify(q: string, ctx: Contesto): Promise<Suggerimento[]> {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", q);
  url.searchParams.set("filter", "countrycode:it");
  url.searchParams.set("lang", "it");
  url.searchParams.set("limit", "6");
  url.searchParams.set("apiKey", CHIAVE);
  if (ctx.lat != null && ctx.lon != null) {
    url.searchParams.set("bias", `proximity:${ctx.lon},${ctx.lat}`);
  }

  const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) return [];
  const d = (await r.json()) as {
    features?: { properties?: Record<string, string> }[];
  };

  return (d.features ?? [])
    .map((f) => f.properties ?? {})
    .map((p) => {
      const via = p.street ?? p.address_line1 ?? "";
      const civico = p.housenumber ?? null;
      const dettaglio = [p.postcode, p.city].filter(Boolean).join(" ");
      return {
        via,
        civico,
        dettaglio,
        testo: componiIndirizzo(via, civico ?? "", dettaglio),
      };
    })
    .filter((s) => s.via);
}

async function google(q: string, ctx: Contesto): Promise<Suggerimento[]> {
  const r = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": CHIAVE,
      },
      body: JSON.stringify({
        input: q,
        includedRegionCodes: ["it"],
        languageCode: "it",
        ...(ctx.lat != null && ctx.lon != null
          ? {
              locationBias: {
                circle: {
                  center: { latitude: ctx.lat, longitude: ctx.lon },
                  // Dieci chilometri: oltre non ci va nessun fattorino.
                  radius: 10000,
                },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(4000),
    }
  );
  if (!r.ok) return [];
  const d = (await r.json()) as {
    suggestions?: {
      placePrediction?: {
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
        text?: { text?: string };
      };
    }[];
  };

  return (d.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => {
      // Google restituisce "Via Roma 12" tutto insieme: il civico si stacca
      // dalla coda, perche' anche qui deve viaggiare in un campo suo.
      const testa = p!.structuredFormat?.mainText?.text ?? p!.text?.text ?? "";
      const m = testa.match(/^(.*?),?\s+(\d+\S*)$/);
      return {
        via: m ? m[1] : testa,
        civico: m ? m[2] : null,
        dettaglio: p!.structuredFormat?.secondaryText?.text ?? "",
        testo: p!.text?.text ?? testa,
      };
    })
    .filter((s) => s.via);
}

// Dove sta un locale, dal suo indirizzo. Si chiama una volta sola nella vita
// del locale e il risultato si salva: e' una richiesta che non ha senso
// ripetere a ogni tasto premuto da un cassiere.
export async function geolocalizza(
  indirizzo: string
): Promise<{ lat: number; lon: number } | null> {
  if (!indirizzo.trim()) return null;
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", indirizzo);
    url.searchParams.set("limit", "1");
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = (await r.json()) as {
      features?: { geometry?: { coordinates?: [number, number] } }[];
    };
    const c = d.features?.[0]?.geometry?.coordinates;
    if (!c) return null;
    // GeoJSON mette prima la longitudine.
    return { lon: c[0], lat: c[1] };
  } catch {
    return null;
  }
}

export async function cercaIndirizzi(
  q: string,
  ctx: Contesto = {}
): Promise<Suggerimento[]> {
  // Sotto le tre lettere qualunque fornitore restituisce mezza Italia.
  if (q.trim().length < 3) return [];

  try {
    const grezzi =
      PROVIDER === "google" && CHIAVE
        ? await google(q, ctx)
        : PROVIDER === "geoapify" && CHIAVE
          ? await geoapify(q, ctx)
          : await photon(q, ctx);

    // Si scartano solo le righe davvero identiche. La chiave e' l'indirizzo
    // intero e non la sola via: "Via Roma 12" esiste in dieci comuni qui
    // intorno, e sono dieci posti diversi dove andare.
    const visti = new Set<string>();
    return grezzi
      .filter((s) => {
        const k = s.testo.toLowerCase();
        if (visti.has(k)) return false;
        visti.add(k);
        return true;
      })
      .slice(0, 6);
  } catch {
    // Il servizio non risponde: l'indirizzo si scrive a mano e la consegna
    // parte lo stesso. Meglio nessun suggerimento che un campo bloccato.
    return [];
  }
}
