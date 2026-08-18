import { config } from "dotenv";

config({ path: ".env.local" });

// Rimette la password del super-admin da riga di comando. La via normale e'
// /admin/account: questa e' quella per quando in /admin non ci si entra piu' —
// password persa, oppure telefono con l'app di autenticazione finito in mare.
//
//   $env:ADMIN_EMAIL="admin@comanda.it"
//   $env:ADMIN_PASSWORD="..."
//   npx tsx scripts/cambia-password-admin.ts
//
// Con ADMIN_DISABLE_2FA="1" spegne anche la verifica in due passaggi: e'
// l'unico modo di rientrare quando il secondo fattore e' perso, e sta qui —
// sul server, dove arriva solo chi ha gia' le chiavi di casa — apposta.
//
// La password arriva dall'ambiente e non dagli argomenti: quello che si scrive
// dopo il comando resta nella cronologia della shell.

async function main() {
  // Import dinamico: il client del database legge DATABASE_URL appena viene
  // caricato, quindi deve avvenire dopo config().
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { platformAdmins } = await import("@/lib/db/schema");
  const { hashPassword } = await import("@/lib/auth");

  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Mancano ADMIN_EMAIL o ADMIN_PASSWORD. Esempio:\n" +
        '  $env:ADMIN_EMAIL="admin@comanda.it"; $env:ADMIN_PASSWORD="..."; npx tsx scripts/cambia-password-admin.ts'
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("La password del gestore del servizio deve essere di almeno 8 caratteri.");
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const spegni2fa = process.env.ADMIN_DISABLE_2FA === "1";

  const aggiornati = await db
    .update(platformAdmins)
    .set({
      passwordHash,
      // Password scelta qui, non arrivata per mail: si entra e si lavora,
      // senza il giro del cambio obbligatorio.
      mustChangePassword: false,
      tempPasswordUntil: null,
      ...(spegni2fa ? { twofaMethod: null, twofaSecret: null } : {}),
    })
    .where(eq(platformAdmins.email, email))
    .returning({ id: platformAdmins.id });

  if (aggiornati.length === 0) {
    console.error(`Nessun amministratore con email ${email}.`);
    process.exit(1);
  }

  // Le sessioni aperte cadono: se si sta rimettendo la password e' perche'
  // qualcosa non andava, e una finestra rimasta aperta altrove non aiuta.
  const { adminSessions } = await import("@/lib/db/schema");
  await db.delete(adminSessions).where(eq(adminSessions.adminId, aggiornati[0].id));

  console.log(
    `Password aggiornata per ${email}.` +
      (spegni2fa ? " Verifica in due passaggi disattivata." : "")
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
