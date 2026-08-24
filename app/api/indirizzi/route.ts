import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { cercaIndirizzi } from "@/lib/indirizzi";
import { coordinateLocale } from "@/lib/consegna";
import { contestoOrdineWeb } from "@/lib/ordini-web";
import { troppeRichieste } from "@/lib/limite";

// Suggerimenti di indirizzo. Li chiedono in due, e non sono la stessa cosa:
//
//   - la cassa, dietro al login dello staff, mentre batte una consegna;
//   - il cliente sulla pagina d'ordinazione, che un login non ce l'ha.
//
// La seconda porta e' aperta a chiunque, quindi si apre solo dove il locale
// consegna davvero dal sito, e con un freno per indirizzo IP: e' una chiamata
// che si paga, e senza limite basterebbe un ciclo per far pagare al locale la
// curiosita' di uno che passava di qui.
const LIMITE_PUBBLICO = 60;
const FINESTRA_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const session = await getSessionUser();
  let tenantId = session?.tenantId ?? null;

  if (!tenantId) {
    const ctx = await contestoOrdineWeb();
    // Niente consegne dal sito, niente ricerca: non c'e' nessun indirizzo da
    // scrivere su questa pagina.
    if (!ctx || !ctx.canali.includes("domicilio")) {
      return NextResponse.json({ risultati: [] }, { status: 401 });
    }

    const chi =
      (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "sconosciuto";
    if (troppeRichieste(`indirizzi:${chi}`, LIMITE_PUBBLICO, FINESTRA_MS)) {
      // Elenco vuoto e non un errore: chi sta scrivendo continua a mano, e la
      // consegna parte lo stesso.
      return NextResponse.json({ risultati: [] });
    }

    tenantId = ctx.tenantId;
  }

  // I risultati si ordinano intorno al locale: una consegna e' quasi sempre a
  // pochi chilometri, e "Via Roma" da sola esiste in ogni comune d'Italia. Le
  // coordinate se le trova e se le salva `coordinateLocale`, che le usa anche
  // per calcolare il costo di consegna: e' la stessa domanda, e va fatta una
  // volta sola nella vita del locale.
  const qui = await coordinateLocale(tenantId);

  const risultati = await cercaIndirizzi(q, {
    lat: qui?.lat ?? null,
    lon: qui?.lon ?? null,
  });

  return NextResponse.json({ risultati });
}
