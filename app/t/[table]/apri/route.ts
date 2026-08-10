import { getTenantFromHost } from "@/lib/tenant-host";
import { openTableSession } from "@/lib/table-session";

// Location relativa: il browser la risolve sull'host della richiesta, cosi'
// il sottodominio del locale resta quello. Costruire un URL assoluto da
// req.url lo perderebbe, mandando il cliente sul dominio radice.
function redirectTo(path: string): Response {
  return new Response(null, { status: 307, headers: { Location: path } });
}

// Destinazione del QR stampato sul tavolo. Valida il token, apre la sessione
// a scadenza e rimanda alla pagina pulita, senza il token nell'URL.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;
  const tableNumber = parseInt(table, 10);
  const tenant = await getTenantFromHost();

  if (!tenant || tenant.suspended) return redirectTo(`/t/${table}`);

  const token = new URL(req.url).searchParams.get("k") ?? "";
  const session = await openTableSession(tenant, tableNumber, token);

  return redirectTo(session ? `/t/${table}` : `/t/${table}?errore=qr`);
}
