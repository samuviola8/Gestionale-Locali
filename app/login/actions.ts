"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth";
import { getTenantFromHost } from "@/lib/tenant-host";
import { passoCodice, passoPassword } from "@/lib/login";
import {
  chiediReset,
  concludiReset,
  MINUTI_LINK_RESET,
  resetChiestoDaPoco,
} from "@/lib/account";
import { inviaLinkReset, linkReset } from "@/lib/account-mail";
import type { Metodo } from "@/lib/twofa";

export type LoginState = {
  ok: boolean;
  error?: boolean;
  /** La password temporanea ricevuta per mail non vale più. */
  scaduta?: boolean;
  /** Password giusta, manca il secondo passaggio. */
  sfida?: { token: string; metodo: Metodo; avviso: string };
  codice?: string;
  /** Il secondo fattore è via mail e la mail non è partita. */
  senzaCodice?: boolean;
};

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended) return { ok: false, error: true };

  const token = String(formData.get("token") ?? "");
  if (token) {
    const r = await passoCodice("user", token, String(formData.get("codice") ?? ""));
    if (r.esito === "no") {
      const metodo = (String(formData.get("metodo") ?? "totp") || "totp") as Metodo;
      return { ok: false, codice: r.messaggio, sfida: { token, metodo, avviso: "" } };
    }
    await createSession(r.id);
    return { ok: true };
  }

  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const password = String(formData.get("password") ?? "");

  const [u] = await db
    .select({
      id: users.id,
      hash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      tempPasswordUntil: users.tempPasswordUntil,
    })
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, email)))
    .limit(1);

  const r = await passoPassword("user", u ?? null, password);
  switch (r.esito) {
    case "credenziali":
      return { ok: false, error: true };
    case "scaduta":
      return { ok: false, scaduta: true };
    case "senza-codice":
      return { ok: false, senzaCodice: true };
    case "sfida":
      return {
        ok: false,
        sfida: { token: r.token, metodo: r.metodo, avviso: r.avviso ?? "" },
      };
    case "ok":
      await createSession(r.id);
      return { ok: true };
  }
}

export type RecuperoState = { fatto?: boolean; errore?: string };

// Quanto si aspetta prima di mandare un altro link allo stesso account: il
// tempo di accorgersi che la mail è già arrivata.
const ATTESA_MINUTI = 2;

/** "Ho perso la password". Manda un link alla casella dell'account.
 *
 *  La password non si tocca: cambia solo quando il link viene aperto. Se
 *  bastasse chiedere, chiunque conosca l'indirizzo del titolare potrebbe
 *  buttarlo fuori dal suo locale quando gli pare.
 *
 *  Risponde sempre allo stesso modo, che l'indirizzo esista o no: se dicesse
 *  "questo indirizzo non c'è", il modulo diventerebbe un elenco di chi lavora
 *  nel locale, buono per chiunque abbia voglia di provarci. */
export async function recuperaPassword(
  _prev: RecuperoState,
  formData: FormData
): Promise<RecuperoState> {
  const tenant = await getTenantFromHost();
  if (!tenant || tenant.suspended)
    return { errore: "Locale non disponibile." };

  const email = String(formData.get("email") ?? "")
    .toLowerCase()
    .trim();
  const generico = { fatto: true };
  if (!email) return generico;

  const [u] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, email)))
    .limit(1);
  if (!u) return generico;

  if (await resetChiestoDaPoco("user", u.id, ATTESA_MINUTI)) return generico;

  const token = await chiediReset("user", u.id);
  const mail = await inviaLinkReset({
    a: u.email,
    nome: tenant.name,
    link: linkReset(tenant.slug, token),
    minuti: MINUTI_LINK_RESET,
    tenantId: tenant.id,
  });
  if (mail === "inviata") return generico;

  // Qui non si sta rivelando niente su chi ha un account: si sta dicendo che
  // questa installazione non sa mandare mail, che è un problema di
  // configurazione e va detto a chi sta davanti allo schermo.
  return {
    errore:
      "Non riusciamo a mandare la mail: chiedi al gestore del servizio di rimetterti la password.",
  };
}

export type NuovaPasswordState = { fatto?: boolean; errore?: string };

/** Il link è stato aperto: qui si sceglie la password nuova. */
export async function impostaNuovaPassword(
  _prev: NuovaPasswordState,
  formData: FormData
): Promise<NuovaPasswordState> {
  const esito = await concludiReset(
    String(formData.get("token") ?? ""),
    String(formData.get("nuova") ?? ""),
    String(formData.get("ripeti") ?? "")
  );
  return esito.ok ? { fatto: true } : { errore: esito.errore };
}
