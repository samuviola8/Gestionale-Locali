import QRCode from "qrcode";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { restaurantTables } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

// Il QR come immagine a se' stante invece che incorporato nella pagina.
// Dodici data-URL dentro l'HTML pesavano 260 KB e andavano rigenerati a ogni
// caricamento; cosi' l'HTML resta leggero e il browser mette in cache i codici.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) return new Response("Non autorizzato", { status: 401 });

  const { id } = await params;
  const row = (
    await db
      .select({
        number: restaurantTables.number,
        token: restaurantTables.token,
      })
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.id, id),
          // Il tavolo dev'essere di questo locale, non di un altro.
          eq(restaurantTables.tenantId, session.tenantId)
        )
      )
      .limit(1)
  )[0];

  if (!row) return new Response("Tavolo non trovato", { status: 404 });

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const url = `${proto}://${session.tenantSlug}.${root}/t/${row.number}/apri?k=${row.token}`;

  // Risoluzione alta: questi codici finiscono stampati e appesi al tavolo.
  const png = await QRCode.toBuffer(url, { margin: 1, width: 640 });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Il token del tavolo non cambia: si puo' tenere in cache nel browser.
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="tavolo-${row.number}.png"`,
    },
  });
}
