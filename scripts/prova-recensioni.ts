import { config } from "dotenv";

config({ path: ".env.local" });

// Prova usa-e-getta di «com'è andata»: le recensioni del locale e le
// testimonianze per la vetrina, su un locale finto che alla fine viene
// cancellato.
//
//   npx tsx scripts/prova-recensioni.ts

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { orders, reviews, tenants, testimonials } = await import(
    "@/lib/db/schema"
  );
  const { createLocaleWithSetup } = await import("@/lib/onboarding");
  const {
    chiediAlGestore,
    daChiedere,
    dovePorta,
    linkRecensioni,
    recensioniDelLocale,
    riassuntoRecensioni,
    salvaRecensione,
    salvaTestimonianza,
    segnaLette,
    votoValido,
  } = await import("@/lib/recensioni");

  let passati = 0;
  let falliti = 0;
  const ok = (c: boolean, m: string) => {
    if (c) {
      passati++;
      console.log("  ok  ", m);
    } else {
      falliti++;
      console.log("  NO  ", m);
    }
  };

  const slug = `prova-rec-${Date.now().toString(36)}`;
  await db.delete(tenants).where(eq(tenants.slug, slug));
  const creato = await createLocaleWithSetup({
    name: "Prova Recensioni",
    slug,
    profile: "pub",
    ownerEmail: `${slug}@example.com`,
    ownerPassword: "prova1234",
    tableCount: 1,
  });
  if (!creato.ok) throw new Error(creato.error);
  const tenantId = creato.tenantId;

  console.log("\n1. Il voto e' da una a cinque stelle");
  ok(votoValido(1) && votoValido(5), "gli estremi valgono");
  ok(!votoValido(0) && !votoValido(6), "fuori no");
  ok(!votoValido(4.5) && !votoValido("5"), "e nemmeno mezze stelle o testo");

  console.log("\n2. Il link al profilo pubblico");
  ok(
    linkRecensioni("g.page/r/prova") === "https://g.page/r/prova",
    "un indirizzo scritto senza https lo prende lo stesso"
  );
  ok(
    linkRecensioni("javascript:alert(1)") === null,
    "un javascript: incollato per dispetto non diventa un link"
  );
  ok(linkRecensioni("   ") === null, "e vuoto vuol dire nessun rimando");
  ok(
    dovePorta("https://www.google.com/maps/place/x") === "Google" &&
      dovePorta("https://it.trustpilot.com/review/x") === "Trustpilot",
    "il posto si riconosce dall'indirizzo, per poterlo nominare"
  );

  console.log("\n3. La domanda si fa dove il locale l'ha accesa");
  const [ordine] = await db
    .insert(orders)
    .values({ tenantId, channel: "asporto", status: "served" })
    .returning({ id: orders.id });
  ok(
    (await daChiedere(tenantId, ordine.id)).chiedi === false,
    "spenta, a nessuno viene chiesto niente"
  );

  await db
    .update(tenants)
    .set({
      reviewsEnabled: true,
      reviewUrl: "https://www.google.com/maps/place/prova",
    })
    .where(eq(tenants.id, tenantId));
  const domanda = await daChiedere(tenantId, ordine.id);
  ok(domanda.chiedi, "accesa, si chiede");
  ok(domanda.dove === "Google", "e si sa dove mandarlo se vuole");

  console.log("\n4. Una per ordine, e solo sui propri");
  ok(
    (await salvaRecensione({
      tenantId,
      orderId: ordine.id,
      canale: "asporto",
      voto: 5,
      testo: "  Tutto benissimo  ",
    })).ok,
    "la prima si scrive"
  );
  const [scritta] = await db
    .select()
    .from(reviews)
    .where(eq(reviews.orderId, ordine.id));
  ok(scritta.comment === "Tutto benissimo", "col testo ripulito ai bordi");
  ok(
    (await daChiedere(tenantId, ordine.id)).chiedi === false,
    "e chi ha risposto non se la ritrova davanti"
  );

  await salvaRecensione({
    tenantId,
    orderId: ordine.id,
    canale: "asporto",
    voto: 1,
    testo: "Ci ripenso",
  });
  const doppie = await db
    .select()
    .from(reviews)
    .where(eq(reviews.orderId, ordine.id));
  ok(
    doppie.length === 1 && doppie[0].rating === 5,
    "il secondo invio non ne aggiunge una seconda, e non riscrive la prima"
  );

  const [altro] = await db
    .insert(orders)
    .values({ tenantId, channel: "tavolo", status: "served" })
    .returning({ id: orders.id });
  const estraneo = await salvaRecensione({
    tenantId: creato.tenantId.replace(/.$/, "0") + "",
    orderId: altro.id,
    canale: "tavolo",
    voto: 5,
  });
  ok(!estraneo.ok, "un ordine di un altro locale non si recensisce");
  ok(
    (await salvaRecensione({
      tenantId,
      orderId: altro.id,
      canale: "tavolo",
      voto: 0,
    })).ok === false,
    "e zero stelle non e' un voto"
  );

  console.log("\n5. Il locale le legge, e il pallino si spegne");
  await salvaRecensione({
    tenantId,
    orderId: altro.id,
    canale: "tavolo",
    voto: 3,
  });
  const riassunto = await riassuntoRecensioni(tenantId);
  ok(riassunto.quante === 2, "due risposte");
  ok(riassunto.media === 4, "media quattro");
  ok(riassunto.daLeggere === 2, "tutte e due da leggere");
  await segnaLette(tenantId);
  ok(
    (await riassuntoRecensioni(tenantId)).daLeggere === 0,
    "guardate, il pallino si spegne"
  );
  const elenco = await recensioniDelLocale(tenantId);
  ok(elenco.length === 2 && elenco[0].quando >= elenco[1].quando,
    "e l'elenco ha le ultime in cima");

  console.log("\n6. La testimonianza si pubblica solo col permesso");
  await salvaTestimonianza({
    tenantId,
    nomeLocale: "Prova Recensioni",
    ruolo: "cliente",
    voto: 5,
    testo: "Ordinato in un minuto",
    firma: "Marco",
    pubblicabile: false,
  });
  const [senza] = await db
    .select()
    .from(testimonials)
    .where(and(eq(testimonials.tenantId, tenantId), eq(testimonials.rating, 5)));
  ok(senza.consentAt === null, "senza spunta non c'e' nessun consenso");
  ok(senza.signature === null, "e la firma non si tiene: non serve a niente");
  ok(!senza.published, "e comunque non e' pubblicata: quello lo decido io");

  await salvaTestimonianza({
    tenantId,
    nomeLocale: "Prova Recensioni",
    ruolo: "gestore",
    voto: 4,
    testo: "Da quando c'e', il telefono squilla la meta'",
    firma: "Anna, Prova Recensioni",
    pubblicabile: true,
  });
  const [con] = await db
    .select()
    .from(testimonials)
    .where(and(eq(testimonials.tenantId, tenantId), eq(testimonials.rating, 4)));
  ok(!!con.consentAt, "col permesso si segna quando e' stato dato");
  ok(
    con.consentText === "Da quando c'e', il telefono squilla la meta'",
    "e su quale testo: un consenso senza il testo e' un ricordo"
  );
  ok(con.role === "gestore", "e si sa chi l'ha scritta");

  await salvaTestimonianza({
    tenantId,
    nomeLocale: "Prova Recensioni",
    ruolo: "cliente",
    voto: 3,
    testo: "",
    firma: "Chi",
    pubblicabile: true,
  });
  const [vuota] = await db
    .select()
    .from(testimonials)
    .where(and(eq(testimonials.tenantId, tenantId), eq(testimonials.rating, 3)));
  ok(
    vuota.consentAt === null,
    "acconsentire a pubblicare niente non e' un consenso a niente"
  );

  console.log("\n7. Al gestore si chiede dopo il primo mese");
  const nuovo = await createLocaleWithSetup({
    name: "Prova Gestore",
    slug: `${slug}-g`,
    profile: "pub",
    ownerEmail: `${slug}-g@example.com`,
    ownerPassword: "prova1234",
    tableCount: 1,
  });
  if (!nuovo.ok) throw new Error(nuovo.error);
  ok(
    (await chiediAlGestore(nuovo.tenantId)) === false,
    "appena aperto non gli si chiede niente: non ha ancora niente da dire"
  );
  const fraDueMesi = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  ok(
    await chiediAlGestore(nuovo.tenantId, { adesso: fraDueMesi }),
    "dopo un mese di lavoro si'"
  );
  await salvaTestimonianza({
    tenantId: nuovo.tenantId,
    nomeLocale: "Prova Gestore",
    ruolo: "gestore",
    voto: 5,
    testo: "Bene",
    firma: "Anna",
    pubblicabile: true,
  });
  ok(
    (await chiediAlGestore(nuovo.tenantId, { adesso: fraDueMesi })) === false,
    "e chi ha risposto non se la ritrova piu' davanti"
  );
  await db.delete(tenants).where(eq(tenants.id, nuovo.tenantId));
  await db.delete(testimonials).where(eq(testimonials.tenantName, "Prova Gestore"));

  console.log("\n8. Le testimonianze sopravvivono al locale che se ne va");
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  const rimaste = await db
    .select()
    .from(testimonials)
    .where(eq(testimonials.tenantName, "Prova Recensioni"));
  ok(
    rimaste.length === 3,
    "il locale non c'e' piu', le sue testimonianze si'"
  );
  ok(
    rimaste.every((t) => t.tenantId === null && t.tenantName === "Prova Recensioni"),
    "e restano leggibili, perche' il nome era copiato accanto"
  );
  const recensioniOrfane = await db
    .select()
    .from(reviews)
    .where(eq(reviews.tenantId, tenantId));
  ok(
    recensioniOrfane.length === 0,
    "le recensioni invece se ne vanno con lui: erano sue"
  );

  await db.delete(testimonials).where(eq(testimonials.tenantName, "Prova Recensioni"));
  console.log(`\n${passati} ok, ${falliti} falliti\n`);
  process.exit(falliti ? 1 : 0);
}

main();
