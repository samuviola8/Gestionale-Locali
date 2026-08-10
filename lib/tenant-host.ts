import { headers } from "next/headers";
import { getTenant, type Tenant } from "@/lib/tenants";

// Ricava il tenant dal sottodominio della richiesta (lato server).
export async function getTenantFromHost(): Promise<Tenant | null> {
  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase();
  const hostname = host.split(":")[0];
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000").split(
    ":"
  )[0];

  let slug = hostname;
  if (hostname.endsWith(`.${root}`)) {
    slug = hostname.slice(0, hostname.length - root.length - 1);
  }
  return getTenant(slug);
}
