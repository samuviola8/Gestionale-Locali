import { verifyPassword } from "@/lib/auth";
import { apriSfida, contoDi, verificaSfida, type Ambito, type Metodo } from "@/lib/twofa";

// Il pezzo di login che è identico per il super-admin e per gli account dei
// locali: password, eventuale scadenza della temporanea, eventuale secondo
// fattore. Chi chiama ci mette solo il proprio modo di trovare l'account e di
// aprire la sessione.

export type Passo =
  | { esito: "ok"; id: string }
  | { esito: "credenziali" }
  | { esito: "scaduta" }
  | { esito: "sfida"; token: string; metodo: Metodo; avviso?: string }
  | { esito: "senza-codice" };

export type ContoLogin = {
  id: string;
  hash: string;
  mustChangePassword: boolean;
  tempPasswordUntil: Date | null;
};

export async function passoPassword(
  scope: Ambito,
  conto: ContoLogin | null,
  password: string
): Promise<Passo> {
  // Anche senza account si paga il prezzo dello scrypt: rispondere subito
  // "non esiste" direbbe a chi prova indirizzi a caso quali sono buoni.
  const hash =
    conto?.hash ??
    "0000000000000000000000000000000000000000000000000000000000000000:00";
  const buona = await verifyPassword(password, hash);
  if (!conto || !buona) return { esito: "credenziali" };

  if (
    conto.mustChangePassword &&
    conto.tempPasswordUntil &&
    conto.tempPasswordUntil.getTime() < Date.now()
  )
    return { esito: "scaduta" };

  const stato = await contoDi(scope, conto.id);
  if (!stato?.metodo) return { esito: "ok", id: conto.id };

  const sfida = await apriSfida(scope, conto.id, stato.metodo, stato);
  if (!sfida) return { esito: "ok", id: conto.id };
  // Il codice via mail non è partito: senza, questa persona non entrerebbe
  // mai. Meglio dirlo che lasciarla davanti a una casella vuota.
  if (sfida.mail === "senza-posta" || sfida.mail === "errore")
    return { esito: "senza-codice" };

  return {
    esito: "sfida",
    token: sfida.token,
    metodo: sfida.metodo,
    avviso:
      sfida.metodo === "email"
        ? `Ti abbiamo mandato sei cifre a ${stato.email}.`
        : "Apri l'app di autenticazione e scrivi le sei cifre.",
  };
}

export type PassoCodice =
  | { esito: "ok"; id: string }
  | { esito: "no"; messaggio: string };

export async function passoCodice(
  scope: Ambito,
  token: string,
  codice: string
): Promise<PassoCodice> {
  const r = await verificaSfida(token, codice);
  if (r.ok && r.scope === scope) return { esito: "ok", id: r.subjectId };
  if (r.ok) return { esito: "no", messaggio: "Codice non valido." };

  return {
    esito: "no",
    messaggio:
      r.motivo === "codice"
        ? "Codice non valido."
        : r.motivo === "troppi"
          ? "Troppi tentativi: rifai l'accesso."
          : "Il codice è scaduto: rifai l'accesso.",
  };
}
