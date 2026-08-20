import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getTenantModules, type ModuleKey } from "@/lib/modules";
import { richiediServizio } from "@/lib/billing/blocco";

// Guardia per le pagine della dashboard legate a un modulo. Nascondere la voce
// dal menu non basta: senza questo controllo l'URL resterebbe raggiungibile a
// mano anche con il modulo spento.
export async function requireModule(key: ModuleKey): Promise<void> {
  await requireAnyModule([key]);
}

// Pagine che servono a piu' moduli: i tavoli li usa il QR per stampare i
// codici e la prenotazione per sapere quanti posti ci sono. Basta uno dei due
// perche' la pagina abbia senso.
export async function requireAnyModule(keys: ModuleKey[]): Promise<void> {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  // Il conto prima del modulo: un locale col servizio spento non deve entrare
  // in una pagina di lavoro nemmeno se il modulo ce l'ha acceso. Passando di
  // qui, ogni pagina che gia' dichiara il proprio modulo e' coperta senza
  // doverselo ricordare una per una.
  await richiediServizio();

  const modules = await getTenantModules(session.tenantId);
  if (!keys.some((k) => modules[k])) redirect("/dashboard");
}
