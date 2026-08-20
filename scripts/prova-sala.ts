import { config } from "dotenv";

config({ path: ".env.local" });

// Prova usa-e-getta dei tavoli uniti e della vista della sala, su un locale
// finto che alla fine viene cancellato. Come prova-accessi.ts, non e' una
// suite di test: e' il giro che si farebbe a mano dalla dashboard, fatto una
// volta sola per vedere se regge.
//
//   npx tsx scripts/prova-sala.ts

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const {
    billSettlements,
    menuCategories,
    menuProducts,
    orders,
    orderItems,
    tenants,
  } =
    await import("@/lib/db/schema");
  const { createLocaleWithSetup } = await import("@/lib/onboarding");
  const { getTenantModules } = await import("@/lib/modules");
  const { createOrderRows } = await import("@/lib/order-create");
  const { loadOpenTables, personeAlTavolo } = await import("@/lib/bill-query");
  const {
    apriSeduta,
    capofila,
    chiudiSeduta,
    sedutaDi,
    seduteAperte,
    spostaTavolo,
    tavoliImpegnati,
  } =
    await import("@/lib/sedute");
  const { statoSala } = await import("@/lib/sala");

  const slug = "prova-sala-tmp";
  let passati = 0;
  let falliti = 0;
  const ok = (b: boolean, cosa: string) => {
    if (b) {
      passati++;
      console.log("  ok   " + cosa);
    } else {
      falliti++;
      console.log("  NO   " + cosa);
    }
  };

  await db.delete(tenants).where(eq(tenants.slug, slug));

  console.log("\n1. Locale di prova con quattro tavoli");
  const creato = await createLocaleWithSetup({
    name: "Prova Sala",
    slug,
    profile: "pub",
    ownerEmail: "prova-sala@example.com",
    ownerPassword: "prova1234",
    tableCount: 4,
  });
  if (!creato.ok) throw new Error(creato.error);
  const tenantId = creato.tenantId;
  const modules = await getTenantModules(tenantId);
  ok(modules.qr_ordering, "modulo ordini acceso");

  const [categoria] = await db
    .insert(menuCategories)
    .values({ tenantId, name: "Prova" })
    .returning({ id: menuCategories.id });
  const [prodotto] = await db
    .insert(menuProducts)
    .values({
      tenantId,
      categoryId: categoria.id,
      name: "Birra",
      priceCents: 500,
    })
    .returning({ id: menuProducts.id });

  const ordina = (tavolo: number, alias: string, quantita = 1) =>
    createOrderRows(
      tenantId,
      tavolo,
      [{ productId: prodotto.id, alias, quantity: quantita }],
      modules
    );

  const sala = () => statoSala(tenantId, modules);
  const tavolo = async (n: number) =>
    (await sala()).tavoli.find((t) => t.numero === n)!;

  console.log("\n2. Sala vuota");
  const vuota = await sala();
  ok(vuota.tavoli.length === 4, "quattro tavoli in pianta");
  ok(vuota.occupati === 0 && vuota.liberi === 4, "nessuno seduto");

  console.log("\n3. Tavolo aperto a mano, prima di ordinare");
  const aperto = await apriSeduta(tenantId, [2], { persone: 3 });
  ok(aperto.ok, "seduta aperta sul tavolo 2");
  const t2 = await tavolo(2);
  ok(!!t2.gruppo, "il tavolo 2 risulta occupato");
  ok(t2.gruppo?.origine === "sala", "e si sa perche': l'ha aperto la sala");
  ok(t2.gruppo?.persone === 3, "tre persone sedute");
  ok(!!t2.gruppo?.da, "e si sa da quando");
  const daSubito = t2.gruppo!.da!.getTime();

  console.log("\n4. Ordinano dal tavolo 2");
  ok((await ordina(2, "Anna")).ok, "ordine accettato");
  const t2b = await tavolo(2);
  ok(t2b.gruppo?.origine === "ordine", "adesso e' il conto a dire che c'e' gente");
  ok(t2b.gruppo?.totaleCents === 500, "il totale del tavolo e' sul riquadro");
  ok(
    t2b.gruppo?.da?.getTime() === daSubito,
    "il tempo resta quello di quando si sono seduti, non della prima ordinazione"
  );

  console.log("\n5. Si accosta il tavolo 3");
  const unito = await apriSeduta(tenantId, [2, 3]);
  ok(unito.ok && unito.capofila === 2, "capofila il tavolo che ha gia' il conto");
  const seduta = sedutaDi(await seduteAperte(tenantId), 3);
  ok(
    seduta?.tavoli.join("+") === "2+3",
    "un gruppo solo su due tavoli, non due gruppi"
  );
  ok(
    seduta?.apertaAlle.getTime() === daSubito,
    "accostare un tavolo non fa ripartire il tempo da capo"
  );

  const t3 = await tavolo(3);
  ok(!!t3.gruppo, "anche il tavolo 3 risulta occupato");
  ok(t3.gruppo?.capofila === 2, "e il suo conto e' quello del 2");
  ok((await sala()).occupati === 2, "in sala risultano occupati due tavoli");

  console.log("\n6. Ordinano dal QR del tavolo accostato");
  ok((await ordina(3, "Bea")).ok, "ordine accettato dal tavolo 3");
  ok(await capofila(tenantId, 3).then((n) => n === 2), "il capofila del 3 e' il 2");
  const suTre = await db
    .select({ tableNumber: orders.tableNumber })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.tableNumber, 3)));
  ok(suTre.length === 0, "nessun ordine resta appeso al tavolo 3");

  const conti = (await loadOpenTables(tenantId)).filter(
    (c) => c.channel === "tavolo"
  );
  ok(conti.length === 1, "un conto solo per i due tavoli");
  ok(conti[0]?.label === "Tavoli 2+3", "e si legge «Tavoli 2+3»");
  ok(conti[0]?.total === 1000, "con dentro le consumazioni di tutti e due");

  const dalTre = await loadOpenTables(tenantId, 3);
  ok(
    dalTre[0]?.key === conti[0]?.key,
    "chi guarda dal telefono al tavolo 3 vede lo stesso conto"
  );
  const nomi = await personeAlTavolo(tenantId, 3);
  ok(
    nomi.includes("Anna") && nomi.includes("Bea"),
    "e trova i nomi di chi ha gia' ordinato dall'altro tavolo"
  );

  console.log("\n7. Si accosta un tavolo che aveva gia' ordinato");
  ok((await ordina(4, "Carlo")).ok, "ordine sul tavolo 4");
  const tre = await apriSeduta(tenantId, [2, 4]);
  ok(tre.ok, "unione accettata");
  const seduta3 = sedutaDi(await seduteAperte(tenantId), 4);
  ok(seduta3?.tavoli.join("+") === "2+3+4", "il gruppo si allarga a 2+3+4");
  const suQuattro = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.tableNumber, 4)));
  ok(suQuattro.length === 0, "quello che aveva ordinato passa sul conto unico");
  const dopo = (await loadOpenTables(tenantId)).filter(
    (c) => c.channel === "tavolo"
  );
  ok(dopo.length === 1 && dopo[0].total === 1500, "e il conto e' ancora uno solo");

  console.log("\n8. Un tavolo dove qualcuno ha gia' pagato non si unisce");
  ok((await ordina(1, "Dora")).ok, "ordine sul tavolo 1");
  const suUno = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.tableNumber, 1)));
  await db
    .update(orderItems)
    .set({ paid: true })
    .where(eq(orderItems.orderId, suUno[0].id));
  const rifiuto = await apriSeduta(tenantId, [1, 2]);
  ok(!rifiuto.ok, "unione rifiutata");
  ok(
    !rifiuto.ok && rifiuto.errore.includes("gia' pagato"),
    "e viene detto perche'"
  );
  const restaUno = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.tableNumber, 1)));
  ok(restaUno.length === 1, "il suo conto resta dov'era");

  console.log("\n9. Si separano");
  const separata = await chiudiSeduta(tenantId, 3);
  ok(separata?.tavoli.join("+") === "2+3+4", "la seduta si chiude tutta insieme");
  const finale = await sala();
  ok(
    finale.tavoli.find((t) => t.numero === 3)?.gruppo === null,
    "il tavolo 3 torna libero"
  );
  ok(
    finale.tavoli.find((t) => t.numero === 2)?.gruppo?.totaleCents === 1500,
    "e quello che era gia' stato ordinato resta sul conto del 2"
  );

  console.log("\n10. Riscrivere i tavoli del gruppo");
  const rifatto = await apriSeduta(tenantId, [2, 3, 4]);
  ok(rifatto.ok && rifatto.tavoli.join("+") === "2+3+4", "gruppo su tre tavoli");

  const stretto = await apriSeduta(tenantId, [2, 3], { esatto: true });
  ok(
    stretto.ok && stretto.tavoli.join("+") === "2+3",
    "riscrivendo l'elenco il tavolo tolto esce dal gruppo"
  );
  ok(
    !sedutaDi(await seduteAperte(tenantId), 4),
    "e torna libero davvero, non solo nell'elenco"
  );

  // Il tavolo che tiene il conto non si lascia fuori nemmeno chiedendolo: il
  // gruppo paga insieme, e liberarlo spezzerebbe il conto in due.
  const senzaCapo = await apriSeduta(tenantId, [3], { esatto: true });
  ok(
    senzaCapo.ok && senzaCapo.tavoli.join("+") === "2+3",
    "il tavolo con il conto aperto resta nel gruppo"
  );

  console.log("\n11. Spostare il conto su un altro tavolo");
  // Un incasso gia' registrato: e' il pezzo che si perde piu' facilmente.
  await db.insert(billSettlements).values({
    tenantId,
    tableNumber: 2,
    alias: "Anna",
    amountCents: 500,
  });
  const primaDelloSpostamento = sedutaDi(await seduteAperte(tenantId), 2)!;

  const spostato = await spostaTavolo(tenantId, 2, [4]);
  ok(spostato.ok && spostato.tavoli.join("+") === "4", "il gruppo passa al 4");
  const contoSpostato = (await loadOpenTables(tenantId)).find(
    (c) => c.channel === "tavolo" && c.tableNumber === 4
  );
  ok(contoSpostato?.total === 1500, "il conto lo segue per intero");
  ok(
    !(await loadOpenTables(tenantId)).some((c) => c.tableNumber === 2),
    "e sul tavolo di prima non resta niente"
  );
  const saldiSpostati = await db
    .select({ tableNumber: billSettlements.tableNumber })
    .from(billSettlements)
    .where(eq(billSettlements.tenantId, tenantId));
  ok(
    saldiSpostati.every((s) => s.tableNumber === 4),
    "chi aveva gia' pagato resta pagato, sul tavolo nuovo"
  );
  ok(
    sedutaDi(await seduteAperte(tenantId), 4)?.apertaAlle.getTime() ===
      primaDelloSpostamento.apertaAlle.getTime(),
    "e non risultano arrivati adesso: l'ora resta quella vera"
  );
  ok(!sedutaDi(await seduteAperte(tenantId), 2), "il tavolo 2 e' libero");

  const addosso = await spostaTavolo(tenantId, 4, [1]);
  ok(!addosso.ok, "su un tavolo con un conto aperto non si sposta");
  const dalVuoto = await spostaTavolo(tenantId, 3, [2]);
  ok(!dalVuoto.ok, "e da un tavolo libero non c'e' niente da spostare");

  // La tavolata che rientra dal dehors: si sposta su piu' tavoli in una mossa.
  const suDue = await spostaTavolo(tenantId, 4, [2, 3]);
  ok(suDue.ok && suDue.tavoli.join("+") === "2+3", "il gruppo passa sul 2+3");
  ok(
    sedutaDi(await seduteAperte(tenantId), 3)?.capofila === 2,
    "e il conto sta sul primo dei due"
  );
  const dopoDue = (await loadOpenTables(tenantId)).find(
    (c) => c.channel === "tavolo" && c.tableNumber === 2
  );
  ok(dopoDue?.total === 1500, "il conto e' ancora tutto li'");
  ok(dopoDue?.label === "Tavoli 2+3", "e si legge sui due tavoli nuovi");
  ok(!sedutaDi(await seduteAperte(tenantId), 4), "il tavolo 4 e' libero");

  console.log("\n12. Il tavolo occupato blocca l'arrivo di chi ha prenotato");
  // Adesso: 1 ha un conto, 2+3 hanno il gruppo appena spostato, 4 e' vuoto.
  const impegnati = await tavoliImpegnati(tenantId, [1, 3, 4]);
  ok(
    impegnati.map((t) => t.tavolo).join(",") === "1,3",
    "sono impegnati solo quelli con gente o con un conto"
  );
  ok(
    impegnati.every((t) => t.da !== null),
    "e di ognuno si sa da quando"
  );

  await db.delete(tenants).where(eq(tenants.id, tenantId));
  console.log(`\n${passati} ok, ${falliti} falliti\n`);
  process.exit(falliti ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
