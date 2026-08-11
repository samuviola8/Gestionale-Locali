import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getTenantModules, type ModuleKey } from "@/lib/modules";

// Guardia per le pagine della dashboard legate a un modulo. Nascondere la voce
// dal menu non basta: senza questo controllo l'URL resterebbe raggiungibile a
// mano anche con il modulo spento.
export async function requireModule(key: ModuleKey): Promise<void> {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  const modules = await getTenantModules(session.tenantId);
  if (!modules[key]) redirect("/dashboard");
}
