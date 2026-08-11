import { headers } from "next/headers";
import { getTenant, type Tenant } from "@/lib/tenants";

// Ricava lo slug del locale dal nome host.
//
// Il dominio radice arriva da NEXT_PUBLIC_ROOT_DOMAIN, ma `*.localhost` resta
// sempre valido: cosi' la stessa installazione risponde sia a
// bar-centrale.localhost:3000 sul computer di sviluppo, sia a
// bar-centrale.<dominio>:3000 dagli altri dispositivi della rete.
export function slugFromHost(host: string, rootDomain: string): string {
  const hostname = (host ?? "").toLowerCase().split(":")[0];
  const root = (rootDomain || "localhost:3000").split(":")[0];

  for (const suffix of [root, "localhost"]) {
    if (suffix && hostname.endsWith(`.${suffix}`)) {
      return hostname.slice(0, hostname.length - suffix.length - 1);
    }
  }
  // Nessun sottodominio: e' il dominio radice (landing, /admin).
  return hostname;
}

export async function getTenantFromHost(): Promise<Tenant | null> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const slug = slugFromHost(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "");
  return getTenant(slug);
}
