import { config } from "dotenv";

config({ path: ".env.local" });

// Prova usa-e-getta delle impostazioni degli ordini dal web, su un locale
// finto che alla fine viene cancellato. Come prova-sala.ts non e' una suite di
// test: e' il giro che si farebbe a mano dalla dashboard, fatto una volta sola
// per vedere se regge.
//
//   npx tsx scripts/prova-ordini-web.ts

async function main() {
  const { and, count, eq } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { menuCategories, menuProducts, orderItems, orders, printJobs, tenants } =
    await import("@/lib/db/schema");
  const { createLocaleWithSetup } = await import("@/lib/onboarding");
  const { getTenantModules, setTenantModules } = await import("@/lib/modules");
  const {
    canaliWeb,
    fasceLibere,
    fasceOrdinabili,
    istante,
    leggiImpostazioniWeb,
    normalizzaCanale,
    ordinePerToken,
    oraSpostata,
    ordiniWebAttivi,
    SPOSTAMENTO_MASSIMO_MS,
    segnaPartitoOrdine,
    segnaProntoOrdine,
    pezziImpegnati,
    fineGiornata,
    sospesoAdesso,
    canaleDi,
    faseDi,
    fasiDelCanale,
    salvaOrdineWeb,
    valutaCarrello,
  } = await import("@/lib/ordini-web");
  const { loadOpenTables } = await import("@/lib/bill-query");
  const { creaComande } = await import("@/lib/stampa");
  const { avvisaClienteOrdine, avvisoDa, mailOrdine, riepilogoOrdine } =
    await import("@/lib/ordini-mail");
  const { mailHtml } = await import("@/lib/mittente");
  const { giornoSettimana, leggiCalendario } = await import("@/lib/orari");
  const { problemiDelLocale } = await import("@/lib/pronto");
  const {
    coordinateLocale,
    costoConsegna,
    distanzaAria,
    FATTORE_STRADA,
    kmStimati,
    leggiFasce,
    raggioMassimo,
  } = await import("@/lib/consegna");

  const slug = "prova-web-tmp";
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

  console.log("\n1. I numeri storti non arrivano a database");
  const ripulito = normalizzaCanale(
    {
      attivo: true,
      passoMinuti: 0,
      preavvisoMinuti: -30,
      giorniAvanti: 400,
      minimoCents: -100,
      accettazioneAutomatica: false,
      nota: "  ",
    },
    "asporto"
  );
  ok(ripulito.passoMinuti === 15, "un passo a zero torna al quarto d'ora");
  ok(
    ripulito.preavvisoMinuti === 20,
    "un preavviso negativo torna al default del canale"
  );
  ok(
    normalizzaCanale({ preavvisoMinuti: 999999 }, "domicilio")
      .preavvisoMinuti === 40,
    "e sul domicilio il default e' piu' lungo: c'e' il giro di chi consegna"
  );
  ok(ripulito.giorniAvanti === 7, "l'orizzonte si ferma sotto il mese");
  ok(ripulito.minimoCents === 0, "un minimo negativo e' nessun minimo");
  ok(ripulito.nota === null, "una nota di soli spazi non e' una nota");
  ok(
    normalizzaCanale("spazzatura", "asporto").attivo === false,
    "e da un blocco che non e' nemmeno un oggetto esce il canale spento"
  );

  console.log("\n2. Locale di prova con asporto e domicilio");
  const creato = await createLocaleWithSetup({
    name: "Prova Web",
    slug,
    profile: "pub",
    ownerEmail: "prova-web@example.com",
    ownerPassword: "prova1234",
    tableCount: 2,
  });
  if (!creato.ok) throw new Error(creato.error);
  const tenantId = creato.tenantId;
  await setTenantModules(tenantId, {
    takeaway: true,
    delivery: true,
    web_orders: true,
  });
  const modules = await getTenantModules(tenantId);
  ok(modules.takeaway && modules.delivery, "i due canali sono accesi");
  ok(modules.web_orders, "e il modulo che li vende dal sito pure");

  const leggi = async () => {
    const [riga] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return leggiImpostazioniWeb(riga);
  };

  console.log("\n3. Un locale nuovo non vende dal web finche' non lo dice");
  const appena = await leggi();
  ok(
    !appena.asporto.attivo && !appena.domicilio.attivo,
    "i due canali nascono spenti"
  );
  ok(
    !ordiniWebAttivi(appena, modules),
    "quindi dal sito non si ordina, anche coi moduli accesi"
  );
  ok(
    appena.asporto.accettazioneAutomatica === false,
    "e gli ordini si accettano a mano"
  );

  console.log("\n4. Il modulo e l'interruttore devono essere d'accordo");
  await db
    .update(tenants)
    .set({
      webOrderChannels: {
        asporto: normalizzaCanale(
          { attivo: true, preavvisoMinuti: 25, giorniAvanti: 2 },
          "asporto"
        ),
        domicilio: normalizzaCanale(
          { attivo: true, preavvisoMinuti: 50, minimoCents: 1000 },
          "domicilio"
        ),
      },
    })
    .where(eq(tenants.id, tenantId));
  const accesi = await leggi();
  ok(
    canaliWeb(accesi, modules).join(",") === "asporto,domicilio",
    "con moduli e interruttori accesi si ordina in tutti e due"
  );
  ok(
    canaliWeb(accesi, { ...modules, delivery: false }).join(",") === "asporto",
    "tolto il modulo consegne resta il solo asporto"
  );
  ok(
    canaliWeb(accesi, { ...modules, web_orders: false }).length === 0,
    "e senza il modulo degli ordini dal sito non si ordina da nessuna parte"
  );
  ok(
    canaleDi(accesi, "domicilio").preavvisoMinuti === 50 &&
      canaleDi(accesi, "asporto").preavvisoMinuti === 25,
    "ogni canale usa il suo preavviso"
  );
  ok(
    canaleDi(accesi, "asporto").giorniAvanti === 2 &&
      canaleDi(accesi, "domicilio").giorniAvanti === 7,
    "e il suo orizzonte: il ritiro fino a dopodomani, la consegna fino a fra una settimana"
  );
  ok(
    canaleDi(accesi, "domicilio").minimoCents === 1000 &&
      canaleDi(accesi, "asporto").minimoCents === 0,
    "e il suo minimo d'ordine"
  );

  console.log("\n5. Un menu tutto escluso e' una pagina che si apre vuota");
  const [categoria] = await db
    .insert(menuCategories)
    .values({ tenantId, name: "Prova" })
    .returning({ id: menuCategories.id });
  const [prodotto] = await db
    .insert(menuProducts)
    .values({
      tenantId,
      categoryId: categoria.id,
      name: "Pizza",
      priceCents: 800,
    })
    .returning({ id: menuProducts.id });
  const [riletto] = await db
    .select({
      asporto: menuProducts.takeawayAvailable,
      domicilio: menuProducts.deliveryAvailable,
    })
    .from(menuProducts)
    .where(eq(menuProducts.id, prodotto.id));
  ok(
    riletto.asporto && riletto.domicilio,
    "un prodotto nuovo nasce da portare via e da consegnare"
  );

  const senzaProblemi = await problemiDelLocale(tenantId, modules);
  ok(
    !senzaProblemi.some((p) => p.chiave.startsWith("menu-asporto")),
    "col menu ordinabile non c'e' niente da segnalare"
  );

  await db
    .update(menuProducts)
    .set({ takeawayAvailable: false })
    .where(and(eq(menuProducts.id, prodotto.id), eq(menuProducts.tenantId, tenantId)));
  const problemi = await problemiDelLocale(tenantId, modules);
  ok(
    problemi.some((p) => p.chiave === "menu-asporto"),
    "escluso l'ultimo prodotto, l'asporto web risulta rotto"
  );
  ok(
    !problemi.some((p) => p.chiave === "menu-domicilio"),
    "ma il domicilio, che ha ancora il prodotto, non si lamenta"
  );

  console.log("\n6. Le zone di consegna si ripuliscono da sole");
  const fasce = leggiFasce([
    { kmFino: 8, costoCents: 600, minimoCents: 2000 },
    { kmFino: 3, costoCents: 300, minimoCents: 1500 },
    // Doppioni e righe impossibili: fuori.
    { kmFino: 3, costoCents: 100, minimoCents: 0 },
    { kmFino: 0, costoCents: 200, minimoCents: 0 },
    { kmFino: 200, costoCents: 900, minimoCents: 0 },
    { kmFino: 5, costoCents: 999999, minimoCents: 0 },
    "spazzatura",
  ]);
  ok(
    fasce.map((f) => f.kmFino).join(",") === "3,8",
    "restano solo le due righe buone, in ordine di distanza"
  );
  ok(fasce[0].costoCents === 300, "e il doppione non ha sovrascritto la prima");
  ok(raggioMassimo(fasce) === 8, "il raggio massimo e' l'ultima fascia");

  console.log("\n7. Quanto costa arrivarci");
  const dentro = costoConsegna({ fasce, km: 2.4, imponibileCents: 2500 });
  ok(
    dentro.ok && dentro.costoCents === 300,
    "a 2,4 km si paga la prima fascia"
  );
  const seconda = costoConsegna({ fasce, km: 6, imponibileCents: 2500 });
  ok(
    seconda.ok && seconda.costoCents === 600,
    "a 6 km si paga la seconda"
  );
  const lontano = costoConsegna({ fasce, km: 12, imponibileCents: 5000 });
  ok(
    !lontano.ok && lontano.motivo === "fuori-zona",
    "oltre l'ultima fascia non si consegna, per quanto spenda"
  );
  const poco = costoConsegna({ fasce, km: 6, imponibileCents: 1200 });
  ok(
    !poco.ok && poco.motivo === "sotto-minimo" && poco.mancanoCents === 800,
    "sotto il minimo della fascia si dice quanto manca"
  );
  ok(
    !costoConsegna({ fasce: [], km: 2, imponibileCents: 5000 }).ok,
    "senza zone scritte non si consegna da nessuna parte"
  );
  const ignota = costoConsegna({ fasce, km: null, imponibileCents: 5000 });
  ok(
    !ignota.ok && ignota.motivo === "distanza-sconosciuta",
    "e un indirizzo che non si trova non e' un rifiuto: e' un costo da confermare"
  );

  console.log("\n8. La consegna offerta non scavalca le altre regole");
  const offerta = costoConsegna({
    fasce,
    km: 6,
    imponibileCents: 3500,
    gratisSopraCents: 3000,
  });
  ok(
    offerta.ok && offerta.costoCents === 0,
    "sopra la soglia il viaggio e' offerto"
  );
  const offertaLontano = costoConsegna({
    fasce,
    km: 20,
    imponibileCents: 9000,
    gratisSopraCents: 3000,
  });
  ok(
    !offertaLontano.ok && offertaLontano.motivo === "fuori-zona",
    "ma fuori zona resta fuori zona"
  );
  const offertaPoco = costoConsegna({
    fasce,
    km: 6,
    imponibileCents: 1900,
    gratisSopraCents: 1500,
  });
  ok(
    !offertaPoco.ok && offertaPoco.motivo === "sotto-minimo",
    "e il minimo d'ordine della fascia vale lo stesso"
  );

  console.log("\n9. I chilometri");
  const duomo = { lat: 45.4642, lon: 9.19 };
  const centrale = { lat: 45.4869, lon: 9.2044 };
  const aria = distanzaAria(duomo, centrale);
  ok(aria > 2.6 && aria < 2.9, "Duomo–Centrale sono meno di tre chilometri in aria");
  ok(distanzaAria(duomo, duomo) === 0, "da qui a qui non c'e' niente da fare");
  ok(
    kmStimati(duomo, centrale) === Math.round(aria * FATTORE_STRADA * 10) / 10,
    "la stima e' l'aria piu' lo scarto delle strade"
  );
  ok(
    kmStimati(duomo, centrale) > aria,
    "e in macchina si fa sempre piu' strada che in linea retta"
  );

  console.log("\n10. Dove sta il locale");
  ok(
    (await coordinateLocale(tenantId)) === null,
    "un locale senza indirizzo non ha una posizione, e non la si inventa"
  );
  await db
    .update(tenants)
    .set({ latitude: duomo.lat, longitude: duomo.lon })
    .where(eq(tenants.id, tenantId));
  const posizione = await coordinateLocale(tenantId);
  ok(
    posizione?.lat === duomo.lat,
    "una volta scritta si rilegge da li', senza ricercarla"
  );

  const problemiConsegna = await problemiDelLocale(tenantId, modules);
  ok(
    problemiConsegna.some((p) => p.chiave === "zone-consegna"),
    "col domicilio web acceso e nessuna zona, il locale risulta rotto"
  );
  ok(
    !problemiConsegna.some((p) => p.chiave === "posizione-locale"),
    "ma la posizione adesso c'e', e non si lamenta piu'"
  );

  console.log("\n11. Il carrello si rilegge dal database");
  await db
    .update(menuProducts)
    .set({ takeawayAvailable: true, deliveryAvailable: false })
    .where(eq(menuProducts.id, prodotto.id));

  const riga = { productId: prodotto.id, alias: "Tavolo", quantity: 3 };
  const valutato = await valutaCarrello(tenantId, "asporto", [riga]);
  ok(
    valutato.ok && valutato.carrello.imponibileCents === 2400,
    "tre pizze da otto euro fanno ventiquattro euro, letti dal menu"
  );
  ok(
    valutato.ok && valutato.carrello.pezzi === 3,
    "e sono tre pezzi per la cucina"
  );
  ok(
    !(await valutaCarrello(tenantId, "domicilio", [riga])).ok,
    "lo stesso carrello a domicilio non passa: quella pizza non si consegna"
  );
  ok(
    !(await valutaCarrello(tenantId, "asporto", [{ ...riga, productId: tenantId }]))
      .ok,
    "e un prodotto inventato non entra"
  );

  console.log("\n12. L'ordine dal web nasce da accettare");
  // Un orario qualsiasi di domani a mezzogiorno: basta che sia dentro la
  // finestra, le fasce vere le decide la pagina.
  const domani = new Date();
  domani.setDate(domani.getDate() + 1);
  const quando = istante(domani, "12:30");

  const primo = await salvaOrdineWeb({
    tenantId,
    canale: "asporto",
    items: [riga],
    modules,
    cfg: { ...accesi, pezziPerFascia: 5 },
    quando,
    pezzi: 3,
    nome: "Prova",
    telefono: "3330000000",
    consegnaCents: 0,
    km: null,
    automatica: false,
  });
  ok(primo.ok, "l'ordine si scrive");
  ok(primo.ok && primo.stato === "pending", "e nasce «da accettare»");

  const trovato = primo.ok
    ? await ordinePerToken(tenantId, primo.token)
    : null;
  ok(trovato?.stato === "pending", "col token si ritrova");
  ok(
    trovato?.totaleCents === 2400,
    "e il totale e' quello del menu, non quello che avrebbe detto il browser"
  );
  ok(
    primo.ok && (await ordinePerToken(creato.tenantId + "", "nonesiste")) === null,
    "un token inventato non apre niente"
  );

  const conti = await loadOpenTables(tenantId);
  ok(
    conti.length === 0,
    "e fino a quando non e' accettato non e' un conto aperto"
  );

  console.log("\n13. La fascia si riempie");
  const impegnati = await pezziImpegnati(tenantId, quando);
  ok(
    impegnati.get(quando.getTime()) === 3,
    "i tre pezzi occupano la loro fascia, anche se l'ordine e' solo da accettare"
  );

  const orari = leggiCalendario(
    { [String(giornoSettimana(domani))]: [{ da: "12:00", a: "15:00" }] },
    []
  );
  const tutte = fasceOrdinabili(orari, domani, new Date(), accesi, "asporto");
  const perDue = fasceLibere({
    fasce: tutte,
    impegnati,
    giorno: domani,
    pezzi: 2,
    tetto: 5,
  });
  const perTre = fasceLibere({
    fasce: tutte,
    impegnati,
    giorno: domani,
    pezzi: 3,
    tetto: 5,
  });
  ok(
    tutte.includes("12:30"),
    "le 12:30 sono una fascia buona dentro l'orario di apertura"
  );
  ok(
    perDue.includes("12:30"),
    "e chi ne ordina due ci sta ancora dentro (3+2 = il tetto)"
  );
  ok(
    !perTre.includes("12:30"),
    "chi ne ordina tre no: quella fascia per lui e' piena"
  );
  ok(
    perTre.length > 0,
    "ma le altre fasce restano libere: non e' pieno il locale, e' pieno quel quarto d'ora"
  );

  console.log("\n14. Con l'accettazione automatica entra in cucina da solo");
  const secondo = await salvaOrdineWeb({
    tenantId,
    canale: "asporto",
    items: [riga],
    modules,
    cfg: { ...accesi, pezziPerFascia: 0 },
    quando: istante(domani, "13:30"),
    pezzi: 3,
    nome: "Prova",
    telefono: "3330000000",
    consegnaCents: 0,
    km: null,
    automatica: true,
  });
  ok(secondo.ok && secondo.stato === "new", "nasce gia' accettato");
  ok(
    (await loadOpenTables(tenantId)).length === 1,
    "e questo si', e' un conto aperto"
  );

  console.log("\n15. L'accettazione: la comanda parte adesso, non prima");
  // Il locale stampa le comande d'asporto: e' l'impostazione che decide, e va
  // accesa per vedere se all'accettazione parte davvero qualcosa.
  await db
    .update(tenants)
    .set({ printComandaAsporto: true })
    .where(eq(tenants.id, tenantId));

  const daAccettare = primo.ok ? primo.token : "";
  const prima = await ordinePerToken(tenantId, daAccettare);
  const [stampePrima] = await db
    .select({ n: count() })
    .from(printJobs)
    .where(eq(printJobs.tenantId, tenantId));
  ok(
    prima?.stato === "pending" && stampePrima.n === 0,
    "finche' e' da accettare non e' partita nessuna comanda"
  );

  // Quello che fa `accettaOrdine`: lo stato passa a "new" e solo allora si
  // creano le comande. L'azione vera vuole una sessione, che qui non c'e'.
  const suo = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.webToken, daAccettare)))
    .limit(1);
  await db
    .update(orders)
    .set({ status: "new" })
    .where(eq(orders.id, suo[0].id));
  const comande = await creaComande(tenantId, suo[0].id);

  ok(comande === 1, "accettandolo parte la comanda");
  const dopo = await ordinePerToken(tenantId, daAccettare);
  ok(dopo?.stato === "new", "e per il cliente adesso e' confermato");
  ok(
    (await loadOpenTables(tenantId)).length === 2,
    "adesso e' anche un conto aperto, come ogni altro ordine"
  );

  console.log("\n16. Il rubinetto del sabato sera");
  ok(!sospesoAdesso(null), "senza sospensione si ordina");
  const stanotte = fineGiornata();
  ok(
    sospesoAdesso(stanotte),
    "sospeso fino a stanotte vuol dire sospeso adesso"
  );
  ok(
    stanotte.getHours() === 0 && stanotte.getMinutes() === 0,
    "e la sospensione scade a mezzanotte, non dopo un numero di ore"
  );
  ok(
    !sospesoAdesso(new Date(Date.now() - 60000)),
    "una sospensione di ieri non sospende piu' niente"
  );

  console.log("\n17. La mail al cliente");
  const conMail = await ordinePerToken(tenantId, daAccettare);
  const avviso = conMail ? avvisoDa(conMail) : null;
  ok(!!avviso, "dall'ordine salvato si ricava l'avviso da mandare");
  ok(
    avviso?.token === daAccettare,
    "e si porta dietro il token, che e' il link del cliente"
  );
  ok(
    avviso?.voci.reduce((s, v) => s + v.quantita, 0) === 3,
    "con dentro i pezzi ordinati"
  );
  ok(
    riepilogoOrdine(avviso!).includes("3 pezzi"),
    "il riassunto per il locale si legge in una riga: " +
      riepilogoOrdine(avviso!)
  );

  // Senza casella configurata non parte niente, e non e' un guasto: l'ordine
  // vale lo stesso. La cosa da controllare e' che non esploda.
  ok(
    (await avvisaClienteOrdine("confermato", avviso!, null)) === false,
    "senza mittente non si manda niente, senza rumore"
  );
  ok(
    (await avvisaClienteOrdine(
      "confermato",
      { ...avviso!, email: null },
      {
        nome: "Prova",
        slug,
        telefono: null,
        indirizzo: null,
        nota: null,
        smtp: {
          host: "smtp.example.invalid",
          port: 465,
          user: "prova@example.invalid",
          pass: "x",
          mittente: "Prova",
        },
      }
    )) === false,
    "e nemmeno a chi non ha lasciato un indirizzo"
  );

  const html = mailHtml({
    occhiello: "Prova",
    titolo: "Ordine confermato",
    saluto: "Ciao Mario,",
    apertura: "È tutto a posto.",
    righe: [["Ritiro", "oggi alle 20:30"]],
    azione: "Vedi l'ordine",
    link: "https://esempio.test/ordina/abc",
    chiusura: "Si paga al ritiro.",
    firma: "Prova · Via Roma 1",
    piede: "Ricevi questa mail perché hai ordinato.",
  });
  ok(
    html.includes("https://esempio.test/ordina/abc"),
    "il foglio della mail porta il link dell'ordine"
  );
  ok(
    mailHtml({
      occhiello: "<script>",
      titolo: "t",
      saluto: "s",
      apertura: "a",
      righe: [],
      azione: "x",
      link: "https://esempio.test",
      chiusura: "c",
      firma: "f",
      piede: "p",
    }).includes("&lt;script&gt;"),
    "e quello che scrive il cliente ci finisce dentro scappato"
  );

  // Ogni avviso si legge per intero: e' il posto in cui un pezzo di testo
  // rimasto a meta' — un buco dove doveva esserci l'ora — finisce davanti al
  // cliente senza che nessuno se ne accorga.
  const mittenteProva = {
    nome: "Trattoria di Prova",
    slug,
    telefono: "0541 000000",
    indirizzo: "Via Roma 1",
    nota: null,
    smtp: null,
  };
  const TIPI = [
    "ricevuto",
    "confermato",
    "spostato",
    "rifiutato",
    "in-preparazione",
    "pronto",
    "in-consegna",
  ] as const;
  for (const tipo of TIPI) {
    const m = mailOrdine(tipo, avviso!, mittenteProva);
    const testo = m.testo;
    ok(
      m.oggetto.length > 0 &&
        !/\s[.,:]/.test(m.oggetto) &&
        !/ {2}/.test(m.oggetto),
      `l'oggetto di «${tipo}» e' scritto tutto: ${m.oggetto}`
    );
    ok(
      !/\s[.,:]/.test(testo.replace(/\n/g, "")) && !/ {2}/.test(testo),
      `e il testo di «${tipo}» non ha buchi dove doveva esserci qualcosa`
    );
    ok(
      testo.includes(`/ordina/${avviso!.token}`),
      `«${tipo}» porta al cliente il link per seguire l'ordine`
    );
  }
  ok(
    mailOrdine("pronto", { ...avviso!, canale: "asporto" }, mittenteProva)
      .testo.includes("ritirarlo") &&
      mailOrdine("pronto", { ...avviso!, canale: "domicilio" }, mittenteProva)
        .testo.includes("uscire"),
    "e «pronto» dice due cose diverse a chi passa e a chi aspetta a casa"
  );

  console.log("\n18. A che punto e' l'ordine");
  const fase = (stato: string, readyAt: Date | null, outAt: Date | null) =>
    faseDi({ stato, canale: "domicilio", readyAt, outAt });
  ok(fase("pending", null, null) === "ricevuto", "da accettare = ricevuto");
  ok(fase("new", null, null) === "confermato", "accettato = confermato");
  ok(
    fase("preparing", null, null) === "preparazione",
    "e quando qualcuno si mette sotto, in preparazione"
  );
  ok(
    fase("preparing", new Date(), null) === "pronto",
    "segnato pronto vince sullo stato della cucina"
  );
  ok(
    fase("preparing", new Date(), new Date()) === "in-consegna",
    "e uscito dal locale vince su pronto"
  );
  ok(fase("served", new Date(), new Date()) === "chiuso", "consegnato = chiuso");
  ok(
    fase("rejected", new Date(), null) === "rifiutato",
    "un rifiutato resta rifiutato, per quanto qualcuno l'avesse segnato pronto"
  );
  ok(
    fasiDelCanale("asporto").length === fasiDelCanale("domicilio").length - 1,
    "chi passa a ritirare non ha la tappa «in consegna»: non gli arrivera' mai"
  );

  console.log("\n19. Le tre mail si accendono una per una");
  const nuove = normalizzaCanale({ attivo: true }, "asporto");
  ok(
    nuove.mailConferme && nuove.mailAggiornamenti && nuove.mailLocale,
    "un canale nuovo le manda tutte e tre"
  );
  ok(
    normalizzaCanale({ attivo: true, mailAggiornamenti: false }, "asporto")
      .mailConferme === true,
    "spegnere gli aggiornamenti non spegne la conferma"
  );
  ok(
    normalizzaCanale({ attivo: true, mailConferme: false }, "asporto")
      .mailConferme === false,
    "e spegnere la conferma si sente"
  );
  // Le due meta' che il locale aveva viste arrivare insieme: al cliente e a
  // se stesso. Sono due destinatari, e si decidono uno alla volta.
  ok(
    normalizzaCanale({ attivo: true, mailConferme: false }, "asporto")
      .mailLocale === true,
    "chi non scrive al cliente puo' continuare a farsi avvisare"
  );
  ok(
    normalizzaCanale({ attivo: true, mailLocale: false }, "asporto")
      .mailConferme === true,
    "e chi non vuole l'avviso sulla propria casella scrive al cliente lo stesso"
  );
  ok(
    normalizzaCanale(
      { attivo: true, mailConferme: false, mailAggiornamenti: false, mailLocale: false },
      "domicilio"
    ).mailLocale === false,
    "spente tutte e tre, non parte niente da nessuna parte"
  );

  console.log("\n20. Pronto e partito, segnati davvero");
  // Non simulati con un UPDATE scritto qui: questi sono gli stessi due
  // comandi che partono dai tasti in coda, ed e' l'unico modo di accorgersi
  // che uno dei due non arriva nemmeno al database.
  const suoToken = primo.ok ? primo.token : "";
  const [suaRiga] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.webToken, suoToken)));

  const segnato = await segnaProntoOrdine(tenantId, suaRiga.id, true);
  ok(segnato.ok && segnato.token === suoToken, "«e' pronto» scrive l'ora");
  const seguito = await ordinePerToken(tenantId, suoToken);
  ok(seguito?.fase === "pronto", "e la pagina del cliente dice pronto");
  ok(!!seguito?.readyAt, "con l'ora di quando lo e' diventato");

  await segnaProntoOrdine(tenantId, suaRiga.id, false);
  ok(
    (await ordinePerToken(tenantId, suoToken))?.readyAt === null,
    "«non era pronto» la cancella"
  );

  // L'asporto non parte con nessuno: il tasto non c'e', e se la chiamata
  // arriva lo stesso non deve scrivere niente.
  ok(
    (await segnaPartitoOrdine(tenantId, suaRiga.id)).ok === false,
    "un asporto non esce dal locale con nessuno"
  );

  const aCasa = await salvaOrdineWeb({
    tenantId,
    canale: "domicilio",
    items: [riga],
    modules,
    cfg: { ...accesi, pezziPerFascia: 20 },
    quando,
    pezzi: 3,
    nome: "Prova a casa",
    telefono: "3330000001",
    indirizzo: "Via Verdi 3",
    consegnaCents: 250,
    km: 2,
    automatica: true,
  });
  ok(aCasa.ok, "e si scrive anche un domicilio");
  const [rigaACasa] = aCasa.ok
    ? await db
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(eq(orders.tenantId, tenantId), eq(orders.webToken, aCasa.token))
        )
    : [];

  const uscito = await segnaPartitoOrdine(tenantId, rigaACasa.id);
  ok(uscito.ok, "«e' partito» scrive l'ora dell'uscita");
  const inStrada = aCasa.ok
    ? await ordinePerToken(tenantId, aCasa.token)
    : null;
  ok(inStrada?.fase === "in-consegna", "e il cliente lo vede in strada");
  ok(
    !!inStrada?.readyAt && !!inStrada?.outAt,
    "premuto senza passare da «e' pronto», l'ora del pronto ripiega su adesso"
  );
  ok(
    !!inStrada?.readyAt &&
      !!inStrada?.outAt &&
      inStrada.readyAt.getTime() <= inStrada.outAt.getTime(),
    "e non esce prima di essere pronto"
  );

  ok(
    (await ordinePerToken(tenantId, "0000000000")) === null,
    "e un token inventato non apre l'ordine di nessun altro"
  );

  console.log("\n21. L'ora concordata si cambia a mano");
  const concordata = istante(domani, "20:30");
  const alle = (ora: string) => istante(domani, ora).toISOString();
  const spostata = oraSpostata(concordata, alle("21:15"));
  ok(
    spostata.ok && spostata.quando?.getHours() === 21,
    "un orario battuto a mano prende il posto di quello concordato"
  );
  ok(
    (() => {
      const uguale = oraSpostata(concordata, concordata.toISOString());
      return uguale.ok && uguale.quando === null;
    })(),
    "rimettere la stessa ora non e' uno spostamento: niente mail al cliente"
  );
  ok(
    (() => {
      const prima = oraSpostata(concordata, alle("20:00"));
      return prima.ok && prima.quando?.getHours() === 20;
    })(),
    "e si puo' anche anticipare, non solo rimandare"
  );
  ok(
    oraSpostata(concordata, "le nove").ok === false,
    "un'ora che non si legge si rifiuta, invece di accettare all'ora vecchia"
  );
  ok(
    oraSpostata(null, alle("21:15")).ok === false,
    "e un ordine senza ora concordata non ha niente da spostare"
  );
  const troppoIn = new Date(
    concordata.getTime() + SPOSTAMENTO_MASSIMO_MS + 60000
  );
  ok(
    oraSpostata(concordata, troppoIn.toISOString()).ok === false,
    "oltre le dodici ore non e' piu' lo stesso ordine: si chiama il cliente"
  );
  ok(
    oraSpostata(
      concordata,
      new Date(concordata.getTime() + SPOSTAMENTO_MASSIMO_MS).toISOString()
    ).ok === true,
    "il confine sta dentro, non fuori"
  );

  console.log("\n22. Note sulle righe e prezzi corretti prima di accettare");
  const conNota = await salvaOrdineWeb({
    tenantId,
    canale: "asporto",
    items: [
      { ...riga, quantity: 1, note: "senza cipolla" },
      { ...riga, quantity: 1, note: "" },
    ],
    modules,
    cfg: { ...accesi, pezziPerFascia: 20 },
    quando,
    pezzi: 2,
    nome: "Prova nota",
    telefono: "3330000002",
    consegnaCents: 0,
    km: null,
    automatica: false,
  });
  ok(conNota.ok, "un ordine con una nota su una riga si scrive");
  const letto = conNota.ok ? await ordinePerToken(tenantId, conNota.token) : null;
  ok(
    !!letto?.voci.some((v) => v.note === "senza cipolla"),
    "la nota del cliente arriva fino alla sua pagina e alla comanda"
  );
  ok(
    !!letto?.voci.some((v) => !v.note),
    "e la riga senza nota resta senza: sono due righe diverse"
  );
  ok(
    letto?.totaleCents === 1600,
    "scrivere una nota non cambia il prezzo: due pizze restano due pizze"
  );

  // Il prezzo corretto da chi accetta — l'ingrediente in piu' concordato al
  // telefono, lo sconto fatto a voce — deve arrivare al cliente: e' il numero
  // che si ritrova sulla sua pagina e nella mail di conferma.
  const [vocePrima] = conNota.ok
    ? await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(eq(orders.tenantId, tenantId), eq(orders.webToken, conNota.token)))
        .limit(1)
    : [];
  await db
    .update(orderItems)
    .set({ priceCents: 1000, priceAdjusted: true })
    .where(eq(orderItems.id, vocePrima.id));
  const corretto = conNota.ok ? await ordinePerToken(tenantId, conNota.token) : null;
  ok(
    corretto?.totaleCents === 1800,
    "cambiato il prezzo di una riga, il totale del cliente segue"
  );

  await db.delete(tenants).where(eq(tenants.id, tenantId));
  console.log(`\n${passati} ok, ${falliti} falliti\n`);
  process.exit(falliti ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
