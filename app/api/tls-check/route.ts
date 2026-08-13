import { NextResponse } from "next/server";
import { slugFromHost } from "@/lib/tenant-host";
import { getTenant } from "@/lib/tenants";

// Chi puo' avere un certificato HTTPS.
//
// Serve al proxy che emette i certificati su richiesta: alla prima visita di
// un sottodominio chiede qui se esiste davvero prima di andare a chiederne uno
// a Let's Encrypt. Senza questo controllo, chiunque punti un nome a questo
// server ci farebbe bruciare il limite di richieste — e con esso i certificati
// dei locali veri.
//
// Cosi' non serve un certificato jolly: aprire un locale nuovo non richiede
// piu' di creare il locale.
export async function GET(req: Request) {
  const dominio = new URL(req.url).searchParams.get("domain") ?? "";
  if (!dominio) return new NextResponse("manca il dominio", { status: 400 });

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "";
  const nome = dominio.toLowerCase().split(":")[0];

  // La vetrina non e' un locale: ha comunque diritto al suo certificato.
  if (root && nome === `comanda.${root}`) return new NextResponse("ok");
  if (root && nome === root) return new NextResponse("ok");

  const slug = slugFromHost(nome, root);
  const tenant = await getTenant(slug);
  if (!tenant) return new NextResponse("sconosciuto", { status: 404 });

  // Un locale sospeso resta raggiungibile: la pagina spiega che il servizio e'
  // fermo, e togliergli il certificato darebbe un errore di sicurezza al
  // cliente invece di un messaggio.
  return new NextResponse("ok");
}
