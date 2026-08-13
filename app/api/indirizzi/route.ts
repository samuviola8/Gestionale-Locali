import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";
import { cercaIndirizzi, geolocalizza } from "@/lib/indirizzi";

// Suggerimenti di indirizzo per la cassa. Dietro al login dello staff: e' una
// chiamata che costa, e lasciarla aperta vorrebbe dire pagare le ricerche di
// chiunque passi di qui.
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ risultati: [] }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q") ?? "";

  // I risultati si ordinano intorno al locale: una consegna e' quasi sempre a
  // pochi chilometri, e "Via Roma" da sola esiste in ogni comune d'Italia.
  const [locale] = await db
    .select({
      indirizzo: tenants.address,
      citta: tenants.city,
      provincia: tenants.province,
      lat: tenants.latitude,
      lon: tenants.longitude,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);

  let lat = locale?.lat ?? null;
  let lon = locale?.lon ?? null;

  // Prima ricerca del locale: si trova dove sta e lo si scrive, cosi' non lo
  // si chiede mai piu'. Se non si trova si cerca lo stesso, solo senza
  // preferenze di zona.
  if (locale && lat == null && (locale.indirizzo || locale.citta)) {
    const dove = await geolocalizza(
      [locale.indirizzo, locale.citta, locale.provincia, "Italia"]
        .filter(Boolean)
        .join(", ")
    );
    if (dove) {
      lat = dove.lat;
      lon = dove.lon;
      await db
        .update(tenants)
        .set({ latitude: dove.lat, longitude: dove.lon })
        .where(eq(tenants.id, session.tenantId));
    }
  }

  const risultati = await cercaIndirizzi(q, { lat, lon });

  return NextResponse.json({ risultati });
}
