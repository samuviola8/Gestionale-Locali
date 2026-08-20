import { readFile } from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/auth";
import { getFile, percorsoFile } from "@/lib/billing/archivio";

// L'unico modo per arrivare a un documento caricato. I file stanno fuori da
// public/ proprio perche' si deve passare di qui: un contratto firmato non e'
// roba che si scarica indovinando un indirizzo.
//
// Ci arrivano in due: io da /admin, e il titolare del locale — ma solo ai
// documenti suoi e solo a quelli marcati come visibili. A tutti gli altri si
// risponde 404 e non 403: dire "esiste ma non e' tuo" e' gia' dire troppo a
// chi sta tirando a indovinare.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const file = await getFile(id);
  if (!file) return new Response("Non trovato", { status: 404 });

  const admin = await getAdminUser();
  if (!admin) {
    const session = await getSessionUser();
    const suo =
      session &&
      session.tenantId === file.tenantId &&
      session.role === "owner" &&
      file.visibleToTenant;
    if (!suo) return new Response("Non trovato", { status: 404 });
  }

  const locale = (
    await db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, file.tenantId))
      .limit(1)
  )[0];
  if (!locale) return new Response("Non trovato", { status: 404 });

  let contenuto: Buffer;
  try {
    contenuto = await readFile(percorsoFile(locale.slug, file.storedName));
  } catch {
    // La riga c'e' ma il file no: e' un guasto mio, non una richiesta sbagliata.
    return new Response("File non piu' disponibile", { status: 410 });
  }

  return new Response(new Uint8Array(contenuto), {
    headers: {
      "Content-Type": file.mimeType,
      // `inline`: un PDF si apre nel browser invece di finire nei download.
      // Il nome torna quello originale, non l'esadecimale che c'e' su disco.
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(contenuto.length),
      // Mai in cache condivisa: e' un documento di un cliente.
      "Cache-Control": "private, no-store",
    },
  });
}
