import { createHmac, randomBytes, randomInt } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginChallenges, platformAdmins, tenants, users } from "@/lib/db/schema";
import { decifra } from "@/lib/segreti";
import { verificaTotp } from "@/lib/totp";
import { inviaCodiceAccesso, type EsitoInvio } from "@/lib/account-mail";

// Il secondo fattore, uguale per il super-admin e per gli account dei locali.
//
// La password giusta non apre piu' la porta da sola: apre una sfida, che vive
// pochi minuti a database e si chiude solo con il codice. Finche' la sfida non
// e' chiusa non esiste nessuna sessione — chi ha rubato la password non entra
// nemmeno per un istante.

export type Ambito = "user" | "admin";
export type Metodo = "totp" | "email";

export const MINUTI_SFIDA = 10;
// Cinque tentativi: sei cifre a indovinare sono un milione di possibilita', ma
// senza un limite un programma le prova tutte mentre nessuno guarda.
const TENTATIVI_MAX = 5;

export function metodoValido(v: string): v is Metodo {
  return v === "totp" || v === "email";
}

export function nomeMetodo(m: Metodo | null): string {
  if (m === "totp") return "App di autenticazione";
  if (m === "email") return "Codice via mail";
  return "Non attivo";
}

// Il codice mandato per mail non si conserva in chiaro: chi legge il database
// non deve poter leggere il codice che sta arrivando alla casella di un altro.
// La chiave e' quella dell'installazione; senza, resta un hash semplice — che
// per sei cifre vive dieci minuti e' comunque piu' di niente.
function impronta(codice: string): string {
  return createHmac("sha256", process.env.APP_SECRET ?? "comanda")
    .update(codice)
    .digest("hex");
}

type Conto = {
  email: string;
  metodo: Metodo | null;
  segreto: string | null;
  nome: string;
  tenantId: string | null;
};

/** L'account con il suo secondo fattore, dal tavolo giusto. Il segreto torna
 *  gia' decifrato e non esce da qui: nessuna pagina lo riceve. */
export async function contoDi(
  scope: Ambito,
  subjectId: string
): Promise<Conto | null> {
  if (scope === "admin") {
    const [a] = await db
      .select({
        email: platformAdmins.email,
        metodo: platformAdmins.twofaMethod,
        segreto: platformAdmins.twofaSecret,
      })
      .from(platformAdmins)
      .where(eq(platformAdmins.id, subjectId))
      .limit(1);
    if (!a) return null;
    return {
      email: a.email,
      metodo: metodoValido(a.metodo ?? "") ? (a.metodo as Metodo) : null,
      segreto: decifra(a.segreto),
      nome: "Comanda",
      tenantId: null,
    };
  }

  const [u] = await db
    .select({
      email: users.email,
      metodo: users.twofaMethod,
      segreto: users.twofaSecret,
      tenantId: users.tenantId,
      nome: tenants.name,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(eq(users.id, subjectId))
    .limit(1);
  if (!u) return null;
  return {
    email: u.email,
    metodo: metodoValido(u.metodo ?? "") ? (u.metodo as Metodo) : null,
    segreto: decifra(u.segreto),
    nome: u.nome,
    tenantId: u.tenantId,
  };
}

export type Sfida = {
  token: string;
  metodo: Metodo;
  /** Solo per il metodo via mail: se la mail e' partita davvero. */
  mail: EsitoInvio | null;
};

/** Apre la sfida dopo una password giusta. Per il codice via mail lo manda
 *  subito; per l'app non manda niente, il codice ce l'ha gia' in tasca.
 *
 *  Il metodo si passa a parte perche' serve anche prima che sia attivo: chi
 *  sta attivando la verifica via mail deve ricevere un codice e dimostrare di
 *  saperlo leggere, altrimenti si accende un lucchetto su una casella
 *  sbagliata e la chiave la butta via da solo. */
export async function apriSfida(
  scope: Ambito,
  subjectId: string,
  metodo: Metodo,
  conto: Conto
): Promise<Sfida | null> {
  conto = { ...conto, metodo };
  if (!conto.metodo) return null;

  // Pulizia occasionale: le sfide scadute non servono a nessuno, e questo e'
  // l'unico momento in cui si passa di qui con la penna in mano.
  await db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, new Date()));

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MINUTI_SFIDA * 60 * 1000);
  const codice =
    conto.metodo === "email" ? String(randomInt(0, 1_000_000)).padStart(6, "0") : null;

  await db.insert(loginChallenges).values({
    scope,
    subjectId,
    token,
    method: conto.metodo,
    codeHash: codice ? impronta(codice) : null,
    expiresAt,
  });

  const mail = codice
    ? await inviaCodiceAccesso({
        a: conto.email,
        nome: conto.nome,
        codice,
        minuti: MINUTI_SFIDA,
        tenantId: conto.tenantId,
      })
    : null;

  return { token, metodo: conto.metodo, mail };
}

export type EsitoSfida =
  | { ok: true; scope: Ambito; subjectId: string }
  | { ok: false; motivo: "scaduta" | "codice" | "troppi" };

export async function verificaSfida(
  token: string,
  codice: string
): Promise<EsitoSfida> {
  const [s] = await db
    .select()
    .from(loginChallenges)
    .where(eq(loginChallenges.token, token))
    .limit(1);

  if (!s || s.expiresAt.getTime() < Date.now())
    return { ok: false, motivo: "scaduta" };
  if (s.attempts >= TENTATIVI_MAX) {
    await db.delete(loginChallenges).where(eq(loginChallenges.id, s.id));
    return { ok: false, motivo: "troppi" };
  }

  const scope = s.scope === "admin" ? "admin" : "user";
  const conto = await contoDi(scope, s.subjectId);
  const dato = codice.replace(/\D/g, "");

  const buono =
    s.method === "email"
      ? !!s.codeHash && dato.length === 6 && impronta(dato) === s.codeHash
      : !!conto?.segreto && verificaTotp(conto.segreto, dato);

  if (!buono) {
    await db
      .update(loginChallenges)
      .set({ attempts: s.attempts + 1 })
      .where(eq(loginChallenges.id, s.id));
    return { ok: false, motivo: "codice" };
  }

  // Una sfida vinta si consuma: lo stesso token non riapre una porta gia'
  // aperta, e il codice via mail vale davvero una volta sola.
  await db.delete(loginChallenges).where(eq(loginChallenges.id, s.id));
  return { ok: true, scope, subjectId: s.subjectId };
}

/** Butta via le sfide aperte di un account. Serve quando la password cambia:
 *  quelle in giro sono nate da una password che non vale piu'. */
export async function chiudiSfide(scope: Ambito, subjectId: string): Promise<void> {
  await db
    .delete(loginChallenges)
    .where(
      and(eq(loginChallenges.scope, scope), eq(loginChallenges.subjectId, subjectId))
    );
}
