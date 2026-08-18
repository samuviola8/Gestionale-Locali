import { config } from "dotenv";

config({ path: ".env.local" });

// Prova usa-e-getta dei flussi di accesso su un locale finto, che alla fine
// viene cancellato. Non e' una suite di test: e' il giro che si farebbe a mano
// col browser, fatto una volta sola per vedere se regge.

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { tenants, users } = await import("@/lib/db/schema");
  const { createLocaleWithSetup } = await import("@/lib/onboarding");
  const { passoPassword, passoCodice } = await import("@/lib/login");
  const { resettaPassword, chiediReset, leggiRichiestaReset, concludiReset } =
    await import("@/lib/account");
  const { nuovoSegreto, verificaTotp } = await import("@/lib/totp");
  const { cifra } = await import("@/lib/segreti");
  const { createHmac } = await import("crypto");

  const slug = "prova-accessi-tmp";
  let passati = 0;
  let falliti = 0;
  const ok = (b: boolean, cosa: string) => {
    if (b) { passati++; console.log("  ok   " + cosa); }
    else { falliti++; console.log("  NO   " + cosa); }
  };

  await db.delete(tenants).where(eq(tenants.slug, slug));

  console.log("\n1. Creazione locale");
  const senza = await createLocaleWithSetup({
    name: "Prova Accessi", slug, profile: "pub",
    ownerEmail: "prova@example.com",
  });
  ok(!senza.ok, "senza password e senza invito: rifiutata");

  const creato = await createLocaleWithSetup({
    name: "Prova Accessi", slug, profile: "pub",
    ownerEmail: "prova@example.com", ownerPassword: "prova1234",
    tableCount: 2,
  });
  ok(creato.ok, "con password scelta: creato");
  if (!creato.ok) throw new Error(creato.error);

  const [u] = await db
    .select().from(users).where(eq(users.email, "prova@example.com")).limit(1);
  ok(!u.mustChangePassword, "password scelta: nessun cambio obbligatorio");

  const carica = async () => {
    const [x] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
    return {
      id: x.id, hash: x.passwordHash,
      mustChangePassword: x.mustChangePassword,
      tempPasswordUntil: x.tempPasswordUntil,
      metodo: x.twofaMethod, segreto: x.twofaSecret,
    };
  };

  console.log("\n2. Password");
  ok((await passoPassword("user", await carica(), "prova1234")).esito === "ok", "password giusta: entra");
  ok((await passoPassword("user", await carica(), "sbagliata")).esito === "credenziali", "password sbagliata: no");
  ok((await passoPassword("user", null, "prova1234")).esito === "credenziali", "account inesistente: no (e senza dirlo)");

  console.log("\n3. Reset con password temporanea");
  const reset = await resettaPassword("user", u.id, false);
  ok(!!reset.password, "genera una temporanea: " + reset.password);
  const dopoReset = await carica();
  ok(dopoReset.mustChangePassword, "segna il cambio obbligatorio");
  ok((await passoPassword("user", dopoReset, reset.password!)).esito === "ok", "la temporanea entra");
  ok((await passoPassword("user", dopoReset, "prova1234")).esito === "credenziali", "la vecchia non entra piu'");

  const scaduta = { ...dopoReset, tempPasswordUntil: new Date(Date.now() - 1000) };
  ok((await passoPassword("user", scaduta, reset.password!)).esito === "scaduta", "temporanea scaduta: rifiutata");

  console.log("\n4. Secondo fattore con l'app (TOTP)");
  const segreto = nuovoSegreto();
  const cifrato = cifra(segreto);
  ok(!!cifrato, "il segreto si cifra (APP_SECRET presente)");
  await db.update(users)
    .set({ twofaMethod: "totp", twofaSecret: cifrato })
    .where(eq(users.id, u.id));

  const conSfida = await passoPassword("user", await carica(), reset.password!);
  ok(conSfida.esito === "sfida", "password giusta: chiede il codice, non entra");
  if (conSfida.esito === "sfida") {
    const sbagliato = await passoCodice("user", conSfida.token, "000000");
    ok(sbagliato.esito === "no", "codice sbagliato: no");

    // Il codice buono si calcola come lo calcolerebbe l'app sul telefono.
    const codice = codiceTotp(segreto, createHmac);
    ok(verificaTotp(segreto, codice), "il codice generato e' quello atteso");
    const giusto = await passoCodice("user", conSfida.token, codice);
    ok(giusto.esito === "ok" && giusto.id === u.id, "codice giusto: entra");
    const riuso = await passoCodice("user", conSfida.token, codice);
    ok(riuso.esito === "no", "la stessa sfida non si riusa");
  }

  console.log("\n5. Secondo fattore via mail, senza posta configurata");
  // Si toglie la posta invece di mandare davvero un codice a un indirizzo
  // finto: qui interessa il caso in cui la mail non puo' partire.
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  await db.update(users)
    .set({ twofaMethod: "email", twofaSecret: null })
    .where(eq(users.id, u.id));
  const senzaPosta = await passoPassword("user", await carica(), reset.password!);
  ok(senzaPosta.esito === "senza-codice", "lo dice invece di lasciare in attesa");

  console.log("\n6. Recupero col link della mail");
  await db.update(users)
    .set({ twofaMethod: null, twofaSecret: null })
    .where(eq(users.id, u.id));

  const primaDelLink = await carica();
  const token = await chiediReset("user", u.id);
  ok(token.length > 20, "apre la richiesta e da' un token");
  const durante = await carica();
  ok(
    durante.hash === primaDelLink.hash,
    "chiedere il link NON cambia la password"
  );
  ok(
    (await passoPassword("user", durante, reset.password!)).esito === "ok",
    "la vecchia password funziona ancora"
  );
  ok((await leggiRichiestaReset(token)).ok, "il link risulta valido");
  ok(!(await leggiRichiestaReset("token-inventato")).ok, "un token inventato no");

  const diverse = await concludiReset(token, "unanuova99", "unaltra99");
  ok(!diverse.ok, "password ripetuta diversa: rifiutata");
  const corta = await concludiReset(token, "corta", "corta");
  ok(!corta.ok, "password corta: rifiutata");

  const fatto = await concludiReset(token, "sceltadame1", "sceltadame1");
  ok(fatto.ok, "aprendo il link la password cambia");
  const dopoLink = await carica();
  ok(
    (await passoPassword("user", dopoLink, "sceltadame1")).esito === "ok",
    "si entra con quella scelta"
  );
  ok(
    (await passoPassword("user", dopoLink, reset.password!)).esito === "credenziali",
    "la vecchia non entra piu'"
  );
  ok(!dopoLink.mustChangePassword, "scelta da chi entra: nessun cambio forzato");
  ok(!(await concludiReset(token, "ancora123", "ancora123")).ok, "il link non si riusa");

  await db.delete(tenants).where(eq(tenants.slug, slug));
  console.log(`\n${passati} ok, ${falliti} falliti\n`);
  process.exit(falliti ? 1 : 0);
}

// Copia del calcolo TOTP fatta a mano: se sbagliassi verificaTotp e usassi
// verificaTotp per provarlo, l'errore si nasconderebbe da solo.
function codiceTotp(
  segretoBase32: string,
  createHmac: typeof import("crypto").createHmac
): string {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bit = 0, val = 0;
  const byte: number[] = [];
  for (const c of segretoBase32) {
    val = (val << 5) | A.indexOf(c);
    bit += 5;
    if (bit >= 8) { byte.push((val >>> (bit - 8)) & 255); bit -= 8; }
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const h = createHmac("sha1", Buffer.from(byte)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
