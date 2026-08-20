"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth";

// I dati di fatturazione li scrive il locale, non io.
//
// Erano solo in /admin, ed era un giro assurdo: la partita IVA e il codice
// destinatario ce li ha lui, glieli da' il suo commercialista, e farmeli
// dettare per telefono per poi ricopiarli a mano vuol dire una cifra sbagliata
// ogni tanto e una fattura da rifare. Qui li mette una volta e li corregge da
// solo quando cambiano.
//
// Restano modificabili anche dal pannello admin: chi firma davanti a me il
// contratto me li lascia li' e non ha voglia di ricompilarli dopo.
export async function salvaDatiFatturazione(formData: FormData): Promise<void> {
  const session = await getSessionUser();
  // Il conto del locale e' del titolare: chi sta in sala per il turno non
  // scrive la ragione sociale.
  if (!session || session.role !== "owner") return;

  const testo = (k: string) => String(formData.get(k) ?? "").trim() || null;

  const [prima] = await db
    .select({
      address: tenants.address,
      city: tenants.city,
      province: tenants.province,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  if (!prima) return;

  const address = testo("address");
  const city = testo("city");
  const province = testo("province")?.toUpperCase() ?? null;

  // Come in /admin: cambiato l'indirizzo, le coordinate ricavate da quello
  // vecchio non valgono piu' e si azzerano, cosi' la prima ricerca di un
  // indirizzo di consegna le ricalcola invece di ordinare i risultati intorno
  // al posto di prima.
  const traslocato =
    address !== prima.address ||
    city !== prima.city ||
    province !== prima.province;

  await db
    .update(tenants)
    .set({
      legalName: testo("legalName"),
      address,
      city,
      province,
      postalCode: testo("postalCode"),
      vatNumber: testo("vatNumber"),
      taxCode: testo("taxCode")?.toUpperCase() ?? null,
      // Sette caratteri maiuscoli: lo SDI scarta la fattura se arriva scritto
      // a modo suo.
      sdiCode: testo("sdiCode")?.toUpperCase() ?? null,
      pecEmail: testo("pecEmail")?.toLowerCase() ?? null,
      billingEmail: testo("billingEmail")?.toLowerCase() ?? null,
      ...(traslocato ? { latitude: null, longitude: null } : {}),
    })
    .where(eq(tenants.id, session.tenantId));

  // Niente redirect: da una server action della dashboard rimbalzerebbe al
  // login. Si resta in pagina e si rilegge quello che si e' appena scritto.
  revalidatePath("/dashboard/fatturazione");
}
