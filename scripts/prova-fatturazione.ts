import { config } from "dotenv";
// Solo il tipo: sparisce alla compilazione, quindi non tira dentro il client
// del database prima che config() abbia letto DATABASE_URL.
import type { ModuleKey } from "@/lib/modules";
import { existsSync, rmSync } from "fs";
import { dirname, sep } from "path";

config({ path: ".env.local" });

// I dati da emittente per la prova. Vanno messi prima di importare qualsiasi
// cosa: lib/billing/emittente.ts li legge dall'ambiente, e senza non si emette.
process.env.FATTURAZIONE_RAGIONE_SOCIALE ||= "Prova Emittente";
process.env.FATTURAZIONE_PIVA ||= "01234567890";
process.env.FATTURAZIONE_INDIRIZZO ||= "Via di Prova 1";
process.env.FATTURAZIONE_CAP ||= "00100";
process.env.FATTURAZIONE_CITTA ||= "Roma";
process.env.FATTURAZIONE_REGIME ||= "forfettario";

// Prova usa-e-getta del giro della fatturazione su un locale finto, che alla
// fine viene cancellato: contratto, scadenza, bozza, emissione, incasso.
// Come prova-accessi.ts, non e' una suite di test — e' il giro che si farebbe
// a mano dal pannello, fatto una volta per vedere se regge.
//
//   npx tsx scripts/prova-fatturazione.ts

async function main() {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { tenants, invoices, invoiceLines, payments, tenantBilling } =
    await import("@/lib/db/schema");
  const { billingPrices } = await import("@/lib/db/schema");
  const { createLocaleWithSetup } = await import("@/lib/onboarding");
  const { getTenantModules, setTenantModules } = await import("@/lib/modules");
  const {
    canoneDaListino,
    canoneMensileCents,
    getContratti,
    getContratto,
    importoAScadenzaCents,
    impostaProva,
    mesiPerScadenza,
    prossimaScadenza,
    salvaContratto,
    segnaProssimaScadenza,
  } = await import("@/lib/billing/contratti");
  const {
    avvisiIntestatario,
    calcolaTotali,
    documentiDelLocale,
    documentoCompleto,
    eliminaBozza,
    emettiDocumento,
    mancanzeIntestatario,
    preparaRinnovi,
    registraIncasso,
  } = await import("@/lib/billing/documenti");
  const { caricaFile, eliminaFile, fileDelLocale, percorsoFile } =
    await import("@/lib/billing/archivio");
  const {
    getPacchetti,
    getPrezziModuli,
    salvaPrezzoModulo,
    salvaPrezzoPacco,
  } = await import("@/lib/billing/prezzi");
  const { getAddons, sincronizzaAddons, totaleAddonsCents } =
    await import("@/lib/billing/addons");
  const { getImpostazioni, salvaImpostazioni } = await import(
    "@/lib/billing/impostazioni"
  );
  const { aggiornaBloccoLocale, sbloccaLocale } = await import(
    "@/lib/billing/blocco"
  );

  const slug = "prova-fatture-tmp";
  let passati = 0;
  let falliti = 0;
  const ok = (b: boolean, cosa: string) => {
    if (b) { passati++; console.log("  ok   " + cosa); }
    else { falliti++; console.log("  NO   " + cosa); }
  };

  // La prova tocca regole e listino, che sono di tutta la piattaforma: me li
  // segno adesso e li rimetto com'erano alla fine, altrimenti far girare
  // questo script sul database di sviluppo cambierebbe i prezzi veri.
  const impostazioniOriginali = await getImpostazioni();
  const listinoOriginale = await db.select().from(billingPrices);

  const giorniFa = (n: number) => new Date(Date.now() - n * 86400000);
  const leggiLocale = async (id: string) => {
    const r = await db
      .select({
        serviceBlocked: tenants.serviceBlocked,
        blockedReason: tenants.blockedReason,
      })
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return r[0];
  };

  await pulisci();

  async function pulisci() {
    const vecchi = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
    for (const t of vecchi) {
      const docs = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.tenantId, t.id));
      if (docs.length) {
        await db.delete(invoiceLines).where(inArray(invoiceLines.invoiceId, docs.map((d) => d.id)));
      }
      await db.delete(payments).where(eq(payments.tenantId, t.id));
      await db.delete(invoices).where(eq(invoices.tenantId, t.id));
      await db.delete(tenants).where(eq(tenants.id, t.id));
    }
    // Cancellare il locale porta via le righe dei documenti caricati, non i
    // file: quelli stanno su disco e resterebbero li' a ogni giro della prova.
    rmSync(dirname(percorsoFile(slug, "x")), { recursive: true, force: true });
  }

  console.log("\n1. Conti che non toccano il database");
  const totali = calcolaTotali([{ kind: "canone", description: "Canone", unitCents: 4900 }]);
  ok(totali.subtotalCents === 4900, "imponibile 49,00");
  ok(totali.vatCents === 0, "forfettario: niente IVA");
  ok(totali.stampCents === 0, "49,00 sta sotto 77,47: niente bollo");
  ok(totali.totalCents === 4900, "totale 49,00");

  const grosso = calcolaTotali([{ kind: "attivazione", description: "Impianto", unitCents: 149000 }]);
  ok(grosso.stampCents === 200, "sopra 77,47 senza IVA: marca da bollo 2,00");
  ok(grosso.totalCents === 149200, "totale 1.492,00");


  const conIva = calcolaTotali(
    [{ kind: "canone", description: "Canone", unitCents: 10000 }],
    { ...(await import("@/lib/billing/emittente")).getEmittente(), regime: "ordinario" }
  );
  ok(conIva.vatCents === 2200, "ordinario: IVA 22% su 100,00");
  ok(conIva.stampCents === 0, "con IVA: niente bollo");

  const gennaio = prossimaScadenza("mensile", new Date(2026, 0, 31));
  ok(
    gennaio.getMonth() === 1 && gennaio.getDate() === 28,
    "31 gennaio + un mese = 28 febbraio, non il 3 marzo"
  );
  const anno = prossimaScadenza("annuale", new Date(2026, 5, 10));
  ok(anno.getFullYear() === 2027 && anno.getMonth() === 5, "annuale: stesso giorno l'anno dopo");

  const listino = await canoneDaListino("locale", "impianto", "mensile");
  ok(
    listino.activationCents === 149000 && listino.recurringCents === 3900,
    "impianto Locale: 1.490 di attivazione + 39 al mese"
  );

  console.log("\n2. Locale nuovo");
  const creato = await createLocaleWithSetup({
    name: "Prova Fatture", slug, profile: "pub",
    ownerEmail: "fatture@example.com", ownerPassword: "prova1234",
    tableCount: 2,
  });
  ok(creato.ok, "creato");
  if (!creato.ok) throw new Error(creato.error);
  const tenantId = creato.tenantId;

  const inProva = await getContratto(tenantId);
  ok(inProva?.status === "prova", "nasce in prova");
  ok(!!inProva?.trialEndsAt, "con una data di fine prova");
  ok(inProva?.nextInvoiceAt === null, "in prova non c'e' niente da fatturare");

  console.log("\n3. Firma");
  await salvaContratto(tenantId, {
    model: "impianto", pack: "locale", period: "mensile",
    recurringCents: 3900, activationCents: 149000, transactionBps: 40,
    status: "attivo", provider: "manuale", notes: "prezzo fondatori",
  });
  const firmato = await getContratto(tenantId);
  ok(firmato?.status === "attivo", "passa ad attivo");
  ok(!!firmato?.startedAt, "segna l'inizio del rapporto");
  ok(!!firmato?.nextInvoiceAt, "e la prima scadenza da fatturare");

  // Un salvataggio che non cambia lo stato non deve spostare il rinnovo.
  const primaScadenza = firmato!.nextInvoiceAt!.getTime();
  await salvaContratto(tenantId, {
    model: "impianto", pack: "locale", period: "mensile",
    recurringCents: 3900, activationCents: 149000, transactionBps: 40,
    status: "attivo", provider: "stripe", notes: "prezzo fondatori",
  });
  const risalvato = await getContratto(tenantId);
  ok(
    risalvato?.nextInvoiceAt?.getTime() === primaScadenza,
    "risalvare non sposta in avanti la scadenza"
  );

  console.log("\n4. Il giro delle scadenze");
  await preparaRinnovi();
  const dopoPrimo = await documentiDelLocale(tenantId);
  ok(dopoPrimo.length === 1, "prepara una bozza");
  const bozza = dopoPrimo[0];
  ok(bozza.status === "bozza" && bozza.number === null, "la bozza non ha numero");
  ok(bozza.subtotalCents === 152900, "attivazione + primo canone: 1.529,00");

  const conRighe = await documentoCompleto(bozza.id);
  ok(conRighe?.righe.length === 2, "due righe: attivazione e canone");

  await preparaRinnovi();
  ok(
    (await documentiDelLocale(tenantId)).length === 1,
    "rilanciarlo subito non duplica: la scadenza e' gia' avanzata"
  );

  console.log("\n4b. Senza i dati del locale non si emette");
  const primaDeiDati = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  ok(
    mancanzeIntestatario(primaDeiDati[0]).length > 0,
    "un locale appena creato non ha ancora i dati per fatturare"
  );

  let rifiutata = false;
  try {
    await emettiDocumento(bozza.id);
  } catch {
    rifiutata = true;
  }
  ok(rifiutata, "l'emissione si rifiuta invece di fare una fattura senza P. IVA");
  ok(
    (await documentoCompleto(bozza.id))!.documento.status === "bozza",
    "e il documento resta bozza, senza bruciare un numero"
  );

  await db
    .update(tenants)
    .set({
      legalName: "Prova Fatture S.r.l.",
      address: "Via di Prova 10",
      postalCode: "20100",
      city: "Milano",
      province: "MI",
      vatNumber: "12345678903",
    })
    .where(eq(tenants.id, tenantId));

  const conDati = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  ok(
    mancanzeIntestatario(conDati[0]).length === 0,
    "compilati ragione sociale, sede e partita IVA non manca piu' niente"
  );
  ok(
    avvisiIntestatario(conDati[0]).length === 1,
    "resta l'avviso su codice destinatario e PEC, che non bloccano"
  );

  console.log("\n5. Emissione");
  await emettiDocumento(bozza.id);
  const emesso = (await documentoCompleto(bozza.id))!.documento;
  ok(emesso.status === "emesso", "passa a emesso");
  ok(emesso.number !== null, `prende il progressivo ${emesso.year}/${emesso.number}`);
  ok(!!emesso.issuedAt && !!emesso.dueAt, "ha data di emissione e scadenza");
  ok(!!emesso.sellerSnapshot && !!emesso.buyerSnapshot, "congela le due parti");
  ok(!!emesso.vatNote, "forfettario: porta la sua riga di legge");
  ok(emesso.sdiStatus === "da_inviare", "resta in attesa dello SDI");

  const numeroPrima = emesso.number;
  await emettiDocumento(bozza.id);
  const riemesso = (await documentoCompleto(bozza.id))!.documento;
  ok(riemesso.number === numeroPrima, "riemettere non riassegna il numero");

  console.log("\n6. Incasso");
  await registraIncasso({
    tenantId, invoiceId: bozza.id, amountCents: 50000,
    method: "bonifico", providerRef: "CRO-1",
  });
  const acconto = (await documentoCompleto(bozza.id))!;
  ok(acconto.documento.status === "emesso", "un acconto non chiude il documento");
  ok(acconto.incassato === 50000, "l'acconto e' registrato");

  await registraIncasso({
    tenantId, invoiceId: bozza.id,
    amountCents: acconto.documento.totalCents - 50000,
    method: "stripe", providerRef: "pi_prova",
  });
  const saldato = (await documentoCompleto(bozza.id))!;
  ok(saldato.documento.status === "pagato", "il saldo lo chiude");
  ok(!!saldato.documento.paidAt, "con la data di pagamento");

  console.log("\n7. Listino modificabile");
  await salvaPrezzoPacco("sala", {
    mensileCents: 5900,
    annualeCents: 59000,
    attivazioneCents: 99000,
    assistenzaCents: 3500,
  });
  const listinoRitoccato = await getPacchetti();
  ok(
    listinoRitoccato.find((p) => p.key === "sala")?.mensileCents === 5900,
    "il prezzo cambiato dal pannello vince sul codice"
  );
  const daListinoOra = await canoneDaListino("sala", "abbonamento", "mensile");
  ok(daListinoOra.recurringCents === 5900, "e lo usa chi propone il canone");
  ok(
    listinoRitoccato.find((p) => p.key === "locale")?.mensileCents === 8900,
    "i pacchetti non toccati restano al prezzo del codice"
  );

  await salvaPrezzoModulo("ai_phone", 5900);
  ok((await getPrezziModuli()).ai_phone === 5900, "vale anche per i moduli");

  console.log("\n8. Moduli e prezzi sono la stessa cosa");
  // Il locale ha il pacchetto "locale": la consegna a domicilio ne sta fuori e
  // ha un prezzo suo, quindi e' l'add-on giusto su cui provare.
  const cambia = async (
    cambi: Partial<Record<ModuleKey, boolean>>,
    prezzi: Partial<Record<ModuleKey, number>> = {}
  ) => {
    const state = { ...(await getTenantModules(tenantId)), ...cambi };
    await setTenantModules(tenantId, state);
    await sincronizzaAddons(tenantId, state, prezzi);
  };

  await cambia({ delivery: false });
  ok((await getAddons(tenantId)).length === 0, "modulo spento: nessun add-on");

  await cambia({ delivery: true });
  ok(
    (await getAddons(tenantId))[0]?.priceCents === 2900,
    "acceso senza toccare il prezzo: entra a listino, non a zero"
  );

  await cambia({ delivery: true }, { delivery: 2000 });
  ok((await totaleAddonsCents(tenantId)) === 2000, "col prezzo scritto a mano: 20,00");

  await cambia({ delivery: true });
  ok(
    (await totaleAddonsCents(tenantId)) === 2000,
    "risalvando senza toccarlo resta il prezzo concordato, non torna a listino"
  );

  await cambia({ counter_orders: true });
  ok(
    (await getAddons(tenantId)).every((a) => a.moduleKey !== "counter_orders"),
    "un modulo compreso nel pacchetto non diventa mai un add-on"
  );

  // Passando al pacchetto che comprende la consegna, smette di pagarla a parte.
  const comeEra = {
    model: "impianto" as const, period: "mensile" as const,
    recurringCents: 3900, activationCents: 149000, transactionBps: 40,
    status: "attivo" as const, provider: "stripe" as const, notes: null,
  };
  await salvaContratto(tenantId, { ...comeEra, pack: "tutto" });
  await cambia({});
  ok(
    (await totaleAddonsCents(tenantId)) === 0,
    "cambiando pacchetto, chi ci entra smette di essere fatturato a parte"
  );

  await salvaContratto(tenantId, { ...comeEra, pack: "locale" });
  await cambia({}, { delivery: 2000 });
  ok((await totaleAddonsCents(tenantId)) === 2000, "e tornando indietro ricompare");

  console.log("\n8b. L'add-on in fattura");
  // Riporto la scadenza a oggi per farmi preparare il rinnovo successivo.
  await segnaProssimaScadenza(tenantId, new Date());
  await preparaRinnovi();
  const conAddon = await documentiDelLocale(tenantId);
  const rinnovo = conAddon.find((d) => d.status === "bozza");
  ok(!!rinnovo, "prepara il rinnovo del mese dopo");
  const righeRinnovo = (await documentoCompleto(rinnovo!.id))!.righe;
  ok(
    righeRinnovo.some((r) => r.unitCents === 2000),
    "l'add-on entra in fattura al prezzo concordato, non a quello di listino"
  );
  ok(
    !righeRinnovo.some((r) => r.kind === "attivazione"),
    "l'attivazione non torna una seconda volta"
  );
  ok(rinnovo!.subtotalCents === 3900 + 2000, "canone piu' add-on: 59,00");

  console.log("\n8c. Il totale mostrato e quello fatturato sono lo stesso");
  const contrattoOra = (await getContratto(tenantId))!;
  ok(
    importoAScadenzaCents(contrattoOra, 2000) === rinnovo!.subtotalCents,
    "l'importo del pannello combacia con l'imponibile della fattura"
  );
  ok(
    importoAScadenzaCents(contrattoOra, 0) === contrattoOra.recurringCents,
    "senza add-on resta il canone e basta"
  );

  const nellElenco = (await getContratti()).find((l) => l.tenantId === tenantId)!;
  ok(nellElenco.addonsCents === 2000, "l'elenco in /admin porta con se' gli add-on");
  ok(
    importoAScadenzaCents(nellElenco.contratto!, nellElenco.addonsCents) ===
      rinnovo!.subtotalCents,
    "e con quelli calcola lo stesso totale"
  );

  // Sull'annuale gli add-on valgono dodici mensilita', in fattura come nel
  // pannello: e' il posto piu' facile dove far divergere i due conti.
  await salvaContratto(tenantId, {
    model: "abbonamento", pack: "locale", period: "annuale",
    recurringCents: 89000, activationCents: 0, transactionBps: 0,
    status: "attivo", provider: "stripe", notes: null,
  });
  const annuale = (await getContratto(tenantId))!;
  ok(mesiPerScadenza(annuale) === 12, "un abbonamento annuale conta dodici mesi");
  ok(
    importoAScadenzaCents(annuale, 2000) === 89000 + 2000 * 12,
    "890 di canone piu' dodici mensilita' di add-on"
  );
  ok(
    canoneMensileCents(annuale, 2000) === Math.round(89000 / 12) + 2000,
    "riportato al mese, l'annuale pesa un dodicesimo piu' l'add-on"
  );

  await segnaProssimaScadenza(tenantId, new Date());
  await preparaRinnovi();
  const bozzaAnnuale = (await documentiDelLocale(tenantId)).find(
    (d) => d.status === "bozza"
  )!;
  ok(
    bozzaAnnuale.subtotalCents === importoAScadenzaCents(annuale, 2000),
    "e la fattura annuale porta esattamente quella cifra"
  );

  // Rimesso com'era, cosi' le prove dopo trovano il contratto che si aspettano.
  await salvaContratto(tenantId, {
    model: "impianto", pack: "locale", period: "mensile",
    recurringCents: 3900, activationCents: 149000, transactionBps: 40,
    status: "attivo", provider: "stripe", notes: "prezzo fondatori",
  });
  await eliminaBozza(bozzaAnnuale.id);

  console.log("\n9. Prove gratuite");
  await salvaImpostazioni({ ...impostazioniOriginali, trialDays: 7 });
  const altroSlug = "prova-fatture-tmp2";
  await db.delete(tenants).where(eq(tenants.slug, altroSlug));
  const secondo = await createLocaleWithSetup({
    name: "Prova Fatture 2", slug: altroSlug, profile: "pub",
    ownerEmail: "fatture2@example.com", ownerPassword: "prova1234",
  });
  if (!secondo.ok) throw new Error(secondo.error);
  const provaBreve = await getContratto(secondo.tenantId);
  const giorniProva = Math.round(
    (provaBreve!.trialEndsAt!.getTime() - Date.now()) / 86400000
  );
  ok(giorniProva === 7, "un locale nuovo prende la durata scelta nelle regole");

  await impostaProva(secondo.tenantId, 21);
  const allungata = await getContratto(secondo.tenantId);
  ok(
    Math.round((allungata!.trialEndsAt!.getTime() - Date.now()) / 86400000) === 21,
    "allungare la prova la conta da oggi"
  );

  console.log("\n10. Prova scaduta");
  await db
    .update(tenantBilling)
    .set({ trialEndsAt: giorniFa(1) })
    .where(eq(tenantBilling.tenantId, secondo.tenantId));
  await salvaImpostazioni({ ...impostazioniOriginali, suspendExpiredTrials: true });
  ok(
    await aggiornaBloccoLocale(secondo.tenantId),
    "prova finita: il servizio si spegne"
  );
  const bloccatoProva = await leggiLocale(secondo.tenantId);
  ok(bloccatoProva.blockedReason === "prova_scaduta", "e dice perche'");

  await salvaImpostazioni({ ...impostazioniOriginali, suspendExpiredTrials: false });
  ok(
    !(await aggiornaBloccoLocale(secondo.tenantId)),
    "spenta la regola, la prova scaduta non blocca piu'"
  );

  await impostaProva(secondo.tenantId, 30);
  await aggiornaBloccoLocale(secondo.tenantId);
  ok(
    !(await leggiLocale(secondo.tenantId)).serviceBlocked,
    "ridandogli la prova torna acceso"
  );

  console.log("\n11. Morosita'");
  // La fattura del rinnovo, emessa e scaduta da un mese.
  await emettiDocumento(rinnovo!.id);
  await db
    .update(invoices)
    .set({ dueAt: giorniFa(30) })
    .where(eq(invoices.id, rinnovo!.id));

  await salvaImpostazioni({ ...impostazioniOriginali, autoSuspend: false, graceDays: 10 });
  ok(
    !(await aggiornaBloccoLocale(tenantId)),
    "col blocco automatico spento non succede niente"
  );

  await salvaImpostazioni({ ...impostazioniOriginali, autoSuspend: true, graceDays: 10 });
  ok(await aggiornaBloccoLocale(tenantId), "acceso, chi e' fuori tolleranza si spegne");
  const moroso = await leggiLocale(tenantId);
  ok(moroso.blockedReason === "morosita", "col motivo giusto");
  ok(
    (await getContratto(tenantId))?.status === "sospeso",
    "e il contratto passa a sospeso"
  );

  await salvaImpostazioni({ ...impostazioniOriginali, autoSuspend: true, graceDays: 60 });
  ok(
    !(await aggiornaBloccoLocale(tenantId)),
    "con sessanta giorni di tolleranza rientra e riparte"
  );
  ok(
    (await getContratto(tenantId))?.status === "attivo",
    "e il contratto torna attivo da solo"
  );

  await salvaImpostazioni({ ...impostazioniOriginali, autoSuspend: true, graceDays: 10 });
  await aggiornaBloccoLocale(tenantId);
  ok((await leggiLocale(tenantId)).serviceBlocked, "rimesso a dieci, si rispegne");

  const daPagare = (await documentoCompleto(rinnovo!.id))!;
  await registraIncasso({
    tenantId,
    invoiceId: rinnovo!.id,
    amountCents: daPagare.documento.totalCents,
    method: "paypal",
    providerRef: "PAYID-prova",
  });
  ok(
    !(await leggiLocale(tenantId)).serviceBlocked,
    "saldata la fattura, il servizio riparte da solo"
  );

  await sbloccaLocale(tenantId);
  ok(!(await leggiLocale(tenantId)).serviceBlocked, "e lo sblocco a mano non rompe niente");

  await db.delete(tenants).where(eq(tenants.slug, altroSlug));

  console.log("\n11b. Documenti caricati");
  const finto = (nome: string, tipo: string, bytes = 64) =>
    new File([new Uint8Array(bytes)], nome, { type: tipo });

  const rifiutato = await caricaFile({
    tenantId, slugLocale: slug, file: finto("virus.exe", "application/x-msdownload"),
    kind: "contratto", title: "Roba", visibleToTenant: true,
  });
  ok(!rifiutato.ok, "un tipo che non c'entra viene rifiutato");

  const troppoGrosso = await caricaFile({
    tenantId, slugLocale: slug,
    file: finto("enorme.pdf", "application/pdf", 16 * 1024 * 1024),
    kind: "contratto", title: "Enorme", visibleToTenant: true,
  });
  ok(!troppoGrosso.ok, "sopra i 15 MB viene rifiutato");

  const caricato = await caricaFile({
    tenantId, slugLocale: slug, file: finto("scan_0012.pdf", "application/pdf"),
    kind: "contratto", title: "Contratto firmato 2026", visibleToTenant: true,
  });
  ok(caricato.ok, "un PDF passa");
  if (!caricato.ok) throw new Error(caricato.errore);

  const senzaTitolo = await caricaFile({
    tenantId, slugLocale: slug, file: finto("appunti.pdf", "application/pdf"),
    kind: "documento", title: "   ", visibleToTenant: false,
  });
  ok(senzaTitolo.ok, "anche senza titolo");

  const tutti2 = await fileDelLocale(tenantId);
  ok(tutti2.length === 2, "l'elenco ne mostra due");
  ok(
    tutti2.some((f) => f.title === "appunti.pdf"),
    "senza titolo vale il nome del file, non una riga vuota"
  );
  ok(
    tutti2.every((f) => f.storedName !== f.fileName),
    "su disco il nome e' un altro: non si indovina un percorso"
  );

  const visibili = await fileDelLocale(tenantId, true);
  ok(visibili.length === 1, "al locale ne arriva solo uno: gli appunti restano miei");
  ok(visibili[0].title === "Contratto firmato 2026", "ed e' il contratto");

  const suDisco = percorsoFile(slug, tutti2[0].storedName);
  ok(existsSync(suDisco), "il file c'e' davvero sul disco");
  ok(
    !suDisco.includes(`${sep}public${sep}`),
    "e non sta sotto public: non si scarica indovinando l'indirizzo"
  );

  await eliminaFile(caricato.id, slug);
  ok((await fileDelLocale(tenantId)).length === 1, "eliminare toglie la riga");
  ok(
    !existsSync(percorsoFile(slug, tutti2.find((f) => f.id === caricato.id)!.storedName)),
    "e anche il file"
  );

  console.log("\n12. Pulizia");
  await pulisci();
  const restano = await db.select().from(tenantBilling).where(eq(tenantBilling.tenantId, tenantId));
  ok(restano.length === 0, "il locale finto e il suo contratto sono spariti");

  await salvaImpostazioni(impostazioniOriginali);
  await db.delete(billingPrices);
  if (listinoOriginale.length) await db.insert(billingPrices).values(listinoOriginale);
  const regoleTornate = await getImpostazioni();
  ok(
    regoleTornate.trialDays === impostazioniOriginali.trialDays &&
      regoleTornate.graceDays === impostazioniOriginali.graceDays &&
      regoleTornate.autoSuspend === impostazioniOriginali.autoSuspend,
    "regole e listino rimessi come erano prima della prova"
  );

  console.log(`\n${passati} ok, ${falliti} da guardare\n`);
  process.exit(falliti ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
