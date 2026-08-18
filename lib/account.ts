import { createHmac, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adminSessions,
  passwordResets,
  platformAdmins,
  sessions,
  tenants,
  users,
} from "@/lib/db/schema";
import {
  GIORNI_PASSWORD_TEMPORANEA,
  hashPassword,
  passwordTemporanea,
  scadenzaPasswordTemporanea,
  verifyPassword,
} from "@/lib/auth";
import { inviaReset, linkAccesso, type EsitoInvio } from "@/lib/account-mail";
import { cifra, cifraturaDisponibile } from "@/lib/segreti";
import {
  nuovoSegreto,
  qrOtpauth,
  segretoLeggibile,
  urlOtpauth,
  verificaTotp,
} from "@/lib/totp";
import {
  apriSfida,
  chiudiSfide,
  contoDi,
  verificaSfida,
  type Ambito,
  type Metodo,
} from "@/lib/twofa";

// Le cose che un account fa su se' stesso: cambiare password, accendere e
// spegnere il secondo fattore. Un solo posto per il super-admin e per gli
// account dei locali — sono due tavoli diversi a database, ma per chi le usa
// sono la stessa pagina, e due copie divergono al primo ritocco.

export type Esito = { ok: true; messaggio?: string } | { ok: false; errore: string };

export type StatoConto = {
  email: string;
  metodo: Metodo | null;
  /** Ha una password temporanea da cambiare. */
  daCambiare: boolean;
  /** Il locale impone il secondo fattore (sempre falso per il super-admin). */
  obbligatoria: boolean;
  /** L'installazione sa custodire segreti: senza, il TOTP non si puo' attivare. */
  segretiDisponibili: boolean;
};

export async function statoConto(
  scope: Ambito,
  id: string
): Promise<StatoConto | null> {
  if (scope === "admin") {
    const [a] = await db
      .select({
        email: platformAdmins.email,
        metodo: platformAdmins.twofaMethod,
        daCambiare: platformAdmins.mustChangePassword,
      })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, id))
      .limit(1);
    if (!a) return null;
    return {
      email: a.email,
      metodo: (a.metodo as Metodo | null) ?? null,
      daCambiare: a.daCambiare,
      obbligatoria: false,
      segretiDisponibili: cifraturaDisponibile(),
    };
  }

  const [u] = await db
    .select({
      email: users.email,
      metodo: users.twofaMethod,
      daCambiare: users.mustChangePassword,
      obbligatoria: tenants.twofaRequired,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(users.id, id))
    .limit(1);
  if (!u) return null;
  return {
    email: u.email,
    metodo: (u.metodo as Metodo | null) ?? null,
    daCambiare: u.daCambiare,
    obbligatoria: u.obbligatoria,
    segretiDisponibili: cifraturaDisponibile(),
  };
}

type Valori = {
  passwordHash?: string;
  mustChangePassword?: boolean;
  tempPasswordUntil?: Date | null;
  twofaMethod?: string | null;
  twofaSecret?: string | null;
  email?: string;
};

async function scrivi(scope: Ambito, id: string, v: Valori): Promise<void> {
  if (scope === "admin") {
    await db.update(platformAdmins).set(v).where(eq(platformAdmins.id, id));
  } else {
    await db.update(users).set(v).where(eq(users.id, id));
  }
}

async function hashAttuale(scope: Ambito, id: string): Promise<string | null> {
  if (scope === "admin") {
    const [a] = await db
      .select({ h: platformAdmins.passwordHash })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, id))
      .limit(1);
    return a?.h ?? null;
  }
  const [u] = await db
    .select({ h: users.passwordHash })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return u?.h ?? null;
}

// Cambiata la password, le altre sessioni cadono. Se qualcuno era entrato con
// la vecchia — il motivo per cui la si sta cambiando — deve trovarsi fuori;
// resta dentro solo il browser da cui si sta cambiando.
async function chiudiAltreSessioni(scope: Ambito, id: string): Promise<void> {
  const store = await cookies();
  if (scope === "admin") {
    const mio = store.get("comanda_admin")?.value ?? "";
    await db
      .delete(adminSessions)
      .where(and(eq(adminSessions.adminId, id), ne(adminSessions.token, mio)));
  } else {
    const mio = store.get("comanda_session")?.value ?? "";
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, id), ne(sessions.token, mio)));
  }
  await chiudiSfide(scope, id);
}

export async function cambiaPassword(
  scope: Ambito,
  id: string,
  attuale: string,
  nuova: string,
  ripeti: string
): Promise<Esito> {
  if (nuova.length < 8)
    return { ok: false, errore: "La nuova password deve avere almeno 8 caratteri." };
  if (nuova !== ripeti)
    return { ok: false, errore: "Le due password non coincidono." };

  const h = await hashAttuale(scope, id);
  if (!h) return { ok: false, errore: "Account non trovato." };
  if (!(await verifyPassword(attuale, h)))
    return { ok: false, errore: "La password attuale non è corretta." };
  if (await verifyPassword(nuova, h))
    return { ok: false, errore: "La nuova password è uguale a quella di adesso." };

  await scrivi(scope, id, {
    passwordHash: await hashPassword(nuova),
    mustChangePassword: false,
    tempPasswordUntil: null,
  });
  await chiudiAltreSessioni(scope, id);
  return { ok: true, messaggio: "Password cambiata." };
}

/** Cambio dell'indirizzo con cui si entra. Solo per il super-admin: gli
 *  account dei locali li gestisce il titolare dalla sua pagina staff. */
export async function cambiaEmailAdmin(
  id: string,
  nuova: string,
  password: string
): Promise<Esito> {
  const email = nuova.toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, errore: "L'indirizzo non è valido." };

  const h = await hashAttuale("admin", id);
  if (!h) return { ok: false, errore: "Account non trovato." };
  // La password serve anche qui: cambiare l'indirizzo di accesso è cambiare la
  // serratura, e non lo deve poter fare chi trova il portatile aperto.
  if (!(await verifyPassword(password, h)))
    return { ok: false, errore: "La password non è corretta." };

  const [preso] = await db
    .select({ id: platformAdmins.id })
    .from(platformAdmins)
    .where(eq(platformAdmins.email, email))
    .limit(1);
  if (preso && preso.id !== id)
    return {
      ok: false,
      errore: "C'è già un altro amministratore con questo indirizzo.",
    };

  await scrivi("admin", id, { email });
  return { ok: true, messaggio: `Da adesso entri con ${email}.` };
}

// --- Reset ------------------------------------------------------------------

export type EsitoReset = {
  ok: boolean;
  /** La password temporanea, da mostrare a chi ha ordinato il reset. */
  password?: string;
  /** Come è andata la mail, se si è chiesto di mandarla. */
  mail?: EsitoInvio;
  errore?: string;
};

/** Azzera la password di un account e ne mette una temporanea.
 *
 *  Le sessioni aperte cadono tutte, comprese quelle di chi ce l'ha ancora: un
 *  reset lo si chiede quando la password è in mano a qualcun altro, e lasciare
 *  aperta la sua finestra non risolverebbe niente. */
export async function resettaPassword(
  scope: Ambito,
  id: string,
  invia: boolean
): Promise<EsitoReset> {
  const password = passwordTemporanea();
  const until = scadenzaPasswordTemporanea();

  const dati =
    scope === "admin"
      ? await db
          .select({ email: platformAdmins.email })
          .from(platformAdmins)
          .where(eq(platformAdmins.id, id))
          .limit(1)
          .then(([a]) =>
            a ? { email: a.email, nome: "Comanda", slug: null, tenantId: null } : null
          )
      : await db
          .select({
            email: users.email,
            nome: tenants.name,
            slug: tenants.slug,
            tenantId: users.tenantId,
          })
          .from(users)
          .innerJoin(tenants, eq(tenants.id, users.tenantId))
          .where(eq(users.id, id))
          .limit(1)
          .then(([u]) => u ?? null);

  if (!dati) return { ok: false, errore: "Account non trovato." };

  await scrivi(scope, id, {
    passwordHash: await hashPassword(password),
    mustChangePassword: true,
    tempPasswordUntil: until,
    // Il secondo fattore resta acceso: la password è ripartita da zero, non
    // l'identità di chi entra.
  });

  if (scope === "admin") {
    await db.delete(adminSessions).where(eq(adminSessions.adminId, id));
  } else {
    await db.delete(sessions).where(eq(sessions.userId, id));
  }
  await chiudiSfide(scope, id);

  if (!invia) return { ok: true, password };

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = process.env.NODE_ENV === "production" ? "https" : "http";
  const mail = await inviaReset({
    a: dati.email,
    nome: dati.nome,
    link: dati.slug ? linkAccesso(dati.slug) : `${proto}://${root}/admin/login`,
    utente: dati.email,
    passwordTemporanea: password,
    giorni: GIORNI_PASSWORD_TEMPORANEA,
    tenantId: dati.tenantId,
  });

  return { ok: true, password, mail };
}

// --- Link per rifare la password --------------------------------------------

/** Quanto vale il link che arriva per mail. Un'ora: il tempo di leggere la
 *  mail e sedersi al computer, non il tempo di lasciarla in casella. */
export const MINUTI_LINK_RESET = 60;

// Del link si conserva l'impronta, mai il link: a database non deve restare
// niente che apra qualcosa. La chiave è quella dell'installazione.
function improntaToken(token: string): string {
  return createHmac("sha256", process.env.APP_SECRET ?? "comanda")
    .update(token)
    .digest("hex");
}

/** Apre una richiesta di recupero e restituisce il token da mettere nel link.
 *  Non tocca la password: quella cambia solo quando il link viene aperto. */
export async function chiediReset(
  scope: Ambito,
  subjectId: string
): Promise<string> {
  // I link scaduti non servono più a nessuno, e questo è l'unico momento in
  // cui si passa di qui con la penna in mano.
  await db.delete(passwordResets).where(lt(passwordResets.expiresAt, new Date()));

  const token = randomBytes(32).toString("hex");
  await db.insert(passwordResets).values({
    scope,
    subjectId,
    tokenHash: improntaToken(token),
    expiresAt: new Date(Date.now() + MINUTI_LINK_RESET * 60 * 1000),
  });
  return token;
}

/** Se esiste già una richiesta aperta più recente di `minuti`. Serve a non
 *  riempire la casella di link a ogni clic sul pulsante. */
export async function resetChiestoDaPoco(
  scope: Ambito,
  subjectId: string,
  minuti: number
): Promise<boolean> {
  const [r] = await db
    .select({ createdAt: passwordResets.createdAt })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.scope, scope),
        eq(passwordResets.subjectId, subjectId),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
        gt(passwordResets.createdAt, new Date(Date.now() - minuti * 60 * 1000))
      )
    )
    .limit(1);
  return !!r;
}

export type RichiestaReset =
  | { ok: true; scope: Ambito; subjectId: string }
  | { ok: false; errore: string };

const LINK_MORTO =
  "Questo link non vale più: è scaduto, oppure è già stato usato. Chiedine un altro.";

export async function leggiRichiestaReset(
  token: string
): Promise<RichiestaReset> {
  const [r] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, improntaToken(token)))
    .limit(1);

  if (!r || r.usedAt || r.expiresAt.getTime() < Date.now())
    return { ok: false, errore: LINK_MORTO };
  return { ok: true, scope: r.scope === "admin" ? "admin" : "user", subjectId: r.subjectId };
}

/** Il link è stato aperto e la nuova password scelta: adesso si cambia.
 *
 *  Qui la password attuale non si chiede — è quella che chi sta scrivendo non
 *  ha. Al suo posto vale il link, che è arrivato nella casella dell'account. */
export async function concludiReset(
  token: string,
  nuova: string,
  ripeti: string
): Promise<Esito> {
  if (nuova.length < 8)
    return { ok: false, errore: "La password deve avere almeno 8 caratteri." };
  if (nuova !== ripeti)
    return { ok: false, errore: "Le due password non coincidono." };

  const r = await leggiRichiestaReset(token);
  if (!r.ok) return { ok: false, errore: r.errore };

  await scrivi(r.scope, r.subjectId, {
    passwordHash: await hashPassword(nuova),
    // Questa se l'è scelta, non gliel'ha dettata nessuno: niente cambio
    // obbligatorio al primo accesso.
    mustChangePassword: false,
    tempPasswordUntil: null,
  });

  // Il link si spende, e con lui gli altri eventualmente in giro per la stessa
  // casella: da adesso vale solo la password appena scelta.
  await db
    .delete(passwordResets)
    .where(
      and(
        eq(passwordResets.scope, r.scope),
        eq(passwordResets.subjectId, r.subjectId)
      )
    );

  // Chi era entrato con la vecchia esce: se si sta rifacendo la password è
  // perché qualcosa non andava.
  if (r.scope === "admin") {
    await db.delete(adminSessions).where(eq(adminSessions.adminId, r.subjectId));
  } else {
    await db.delete(sessions).where(eq(sessions.userId, r.subjectId));
  }
  await chiudiSfide(r.scope, r.subjectId);

  return { ok: true, messaggio: "Password cambiata: entra con quella nuova." };
}

// --- Secondo fattore ---------------------------------------------------------

export type AvvioTotp =
  | { ok: true; qr: string; segreto: string }
  | { ok: false; errore: string };

/** Prepara l'app di autenticazione: genera il segreto, lo salva cifrato e
 *  restituisce il QR. Il fattore resta spento finché non arriva un codice
 *  giusto: chi non riesce a inquadrare il QR non deve restare chiuso fuori. */
export async function preparaTotp(scope: Ambito, id: string): Promise<AvvioTotp> {
  if (!cifraturaDisponibile())
    return {
      ok: false,
      errore:
        "Questa installazione non ha APP_SECRET: senza, il segreto dell'app finirebbe in chiaro a database. Usa il codice via mail, oppure configura APP_SECRET.",
    };

  const conto = await contoDi(scope, id);
  if (!conto) return { ok: false, errore: "Account non trovato." };

  const segreto = nuovoSegreto();
  await scrivi(scope, id, { twofaSecret: cifra(segreto) });

  const url = urlOtpauth(segreto, conto.email, `Comanda · ${conto.nome}`);
  return { ok: true, qr: await qrOtpauth(url), segreto: segretoLeggibile(segreto) };
}

export async function confermaTotp(
  scope: Ambito,
  id: string,
  codice: string
): Promise<Esito> {
  const conto = await contoDi(scope, id);
  if (!conto?.segreto)
    return { ok: false, errore: "Ricomincia: il segreto non c'è più." };
  if (!verificaTotp(conto.segreto, codice))
    return {
      ok: false,
      errore: "Codice non valido. Controlla di aver inquadrato il QR giusto.",
    };

  await scrivi(scope, id, { twofaMethod: "totp" });
  return { ok: true, messaggio: "Da adesso entri con l'app di autenticazione." };
}

export type AvvioMail =
  | { ok: true; token: string; avviso: string }
  | { ok: false; errore: string };

/** Prepara la verifica via mail: manda un codice alla casella dell'account.
 *  Se la mail non parte non si attiva niente — accendere un lucchetto su una
 *  casella che non riceve vuol dire chiudersi fuori da soli. */
export async function preparaMail(scope: Ambito, id: string): Promise<AvvioMail> {
  const conto = await contoDi(scope, id);
  if (!conto) return { ok: false, errore: "Account non trovato." };

  const sfida = await apriSfida(scope, id, "email", conto);
  if (!sfida)
    return { ok: false, errore: "Non è stato possibile mandare il codice." };
  if (sfida.mail === "senza-posta")
    return {
      ok: false,
      errore:
        "Non c'è nessuna casella configurata per mandare il codice: configura la posta, oppure usa l'app di autenticazione.",
    };
  if (sfida.mail === "errore")
    return { ok: false, errore: "La mail col codice non è partita. Riprova." };

  return { ok: true, token: sfida.token, avviso: `Codice mandato a ${conto.email}.` };
}

export async function confermaMail(
  scope: Ambito,
  id: string,
  token: string,
  codice: string
): Promise<Esito> {
  const esito = await verificaSfida(token, codice);
  if (!esito.ok)
    return {
      ok: false,
      errore:
        esito.motivo === "codice"
          ? "Codice non valido."
          : "Il codice è scaduto: chiedine un altro.",
    };
  if (esito.subjectId !== id || esito.scope !== scope)
    return { ok: false, errore: "Codice non valido." };

  await scrivi(scope, id, { twofaMethod: "email", twofaSecret: null });
  return {
    ok: true,
    messaggio: "Da adesso ti mandiamo un codice per mail a ogni accesso.",
  };
}

/** Azzera il secondo fattore senza chiedere il permesso all'obbligo del
 *  locale. È la mossa del super-admin per il titolare che ha perso il
 *  telefono: se il locale la richiede, al primo accesso se la riconfigura. */
export async function azzeraDueFattori(scope: Ambito, id: string): Promise<Esito> {
  await scrivi(scope, id, { twofaMethod: null, twofaSecret: null });
  await chiudiSfide(scope, id);
  return { ok: true, messaggio: "Verifica in due passaggi azzerata." };
}

export async function spegniDueFattori(scope: Ambito, id: string): Promise<Esito> {
  const stato = await statoConto(scope, id);
  if (!stato) return { ok: false, errore: "Account non trovato." };
  if (stato.obbligatoria)
    return {
      ok: false,
      errore:
        "Il locale richiede la verifica in due passaggi: puoi cambiare metodo, non toglierla.",
    };

  await scrivi(scope, id, { twofaMethod: null, twofaSecret: null });
  await chiudiSfide(scope, id);
  return { ok: true, messaggio: "Verifica in due passaggi disattivata." };
}
