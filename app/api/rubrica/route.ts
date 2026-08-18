import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { hasModule } from "@/lib/modules";
import { cercaClienti } from "@/lib/rubrica";

// Suggerimenti della rubrica per la cassa. Dietro al login dello staff: qui
// dentro ci sono nomi, numeri di telefono e indirizzi di casa di persone vere,
// e non e' roba che si lascia interrogare a chiunque passi di qui.
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ risultati: [] }, { status: 401 });
  if (!(await hasModule(session.tenantId, "customers"))) {
    return NextResponse.json({ risultati: [] }, { status: 403 });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const risultati = await cercaClienti(session.tenantId, q);

  return NextResponse.json({ risultati });
}
