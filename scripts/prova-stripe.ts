import { config } from "dotenv";
import type Stripe from "stripe";

config({ path: ".env.local" });

// Il giro dell'incasso con carta su un locale finto, che alla fine viene
// cancellato. Come prova-fatturazione.ts non e' una suite di test: e' il giro
// che si farebbe a mano, fatto una volta per vedere se regge.
//
//   npx tsx scripts/prova-stripe.ts
//
// Gli avvisi di Stripe qui sono finti, costruiti a mano. E' il punto: quello
// che si vuole provare non e' che Stripe sappia incassare — quello lo sa — ma
// che noi si scriva la cifra giusta, una volta sola, con la data giusta. Per
// provare il pagamento vero c'e' l'ultima sezione, che stampa un indirizzo da
// aprire nel browser.

async function main() {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db");
  const { invoiceLines, invoices, payments, tenantBilling, tenants } = await import(
    "@/lib/db/schema"
  );
  const { createLocaleWithSetup } = await import("@/lib/onboarding");
  const { getContratto, salvaContratto } = await import("@/lib/billing/contratti");
  const { intervallo, prodottoId, righeDelContratto } = await import(
    "@/lib/stripe/catalogo"
  );
  const { gestisciEvento } = await import("@/lib/stripe/eventi");
  const { stripeConfigurato, stripeInProva } = await import("@/lib/stripe/client");

  const slug = "prova-stripe-tmp";
  let passati = 0;
  let falliti = 0;
  const ok = (b: boolean, cosa: string) => {
    if (b) { passati++; console.log("  ok   " + cosa); }
    else { falliti++; console.log("  NO   " + cosa); }
  };

  await pulisci();

  // La sezione 8 lascia in piedi il locale finto, perche' su Stripe si paga
  // col browser e il pagamento arriva dopo che lo script e' finito. Questo e'
  // il modo di toglierlo quando si e' visto abbastanza.
  if (process.argv[2] === "--pulisci") {
    console.log(`\nLocale di prova "${slug}" tolto di mezzo.\n`);
    process.exit(0);
  }

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
  }

  console.log("\n1. Le righe da mandare a Stripe, senza toccare niente");

  // Il contratto in miniatura: a righeDelContratto servono cinque campi, non
  // tutta la riga del database.
  const finto = (v: Partial<Record<string, unknown>>) =>
    ({
      model: "abbonamento", pack: "locale", period: "mensile",
      recurringCents: 8900, activationCents: 0, activationInvoicedAt: null,
      ...v,
    }) as Parameters<typeof righeDelContratto>[0];

  const mensile = righeDelContratto(finto({}));
  ok(mensile?.length === 1, "un abbonamento mensile e' una riga sola");
  ok(
    mensile?.[0].price_data?.unit_amount === 8900,
    "e l'importo e' quello del contratto, non quello del listino"
  );
  ok(
    mensile?.[0].price_data?.recurring?.interval === "month",
    "che si rinnova ogni mese"
  );
  ok(
    mensile?.[0].price_data?.product === prodottoId("locale", "abbonamento"),
    "attaccata al prodotto giusto"
  );

  const annuale = righeDelContratto(finto({ period: "annuale", recurringCents: 89000 }));
  ok(
    annuale?.[0].price_data?.recurring?.interval === "year",
    "l'annuale si rinnova ogni anno"
  );

  const impianto = righeDelContratto(
    finto({ model: "impianto", recurringCents: 3900, activationCents: 149000 })
  );
  ok(impianto?.length === 2, "l'impianto sono due righe: assistenza e attivazione");
  ok(
    !!impianto?.some(
      (r) => r.price_data?.recurring?.interval === "month" && r.price_data?.unit_amount === 3900
    ),
    "l'assistenza e' mensile"
  );
  ok(
    !!impianto?.some((r) => !r.price_data?.recurring && r.price_data?.unit_amount === 149000),
    "l'attivazione non si ripete"
  );

  ok(
    intervallo("impianto", "annuale") === "month",
    "l'assistenza resta mensile anche se il contratto dice annuale"
  );

  const giaFatturata = righeDelContratto(
    finto({
      model: "impianto", recurringCents: 3900, activationCents: 149000,
      activationInvoicedAt: new Date(),
    })
  );
  ok(
    giaFatturata?.length === 1,
    "un'attivazione gia' fatturata non si fa pagare due volte"
  );

  // Il caso che mancava: un abbonamento con un impianto iniziale da pagare.
  // `activation_cents` si scrive a mano dal pannello e non e' roba del solo
  // modello "impianto" — legarcela voleva dire non incassarla mai.
  const abbConAttivazione = righeDelContratto(
    finto({ model: "abbonamento", recurringCents: 8900, activationCents: 50000 })
  );
  ok(
    abbConAttivazione?.length === 2,
    "un abbonamento con attivazione manda due righe, non una"
  );
  ok(
    !!abbConAttivazione?.some(
      (r) => !r.price_data?.recurring && r.price_data?.unit_amount === 50000
    ),
    "l'attivazione c'e' anche se il modello e' abbonamento"
  );
  ok(
    !!abbConAttivazione?.some(
      (r) => r.price_data?.recurring?.interval === "month" && r.price_data?.unit_amount === 8900
    ),
    "e il canone mensile ci sta accanto: al primo pagamento vanno insieme"
  );
  ok(
    righeDelContratto(
      finto({ recurringCents: 0, activationCents: 50000 })
    )?.length === 1,
    "solo attivazione, senza canone: una riga sola"
  );

  ok(
    righeDelContratto(finto({ recurringCents: 0 })) === null,
    "un contratto a zero non apre nessun abbonamento"
  );

  console.log("\n1b. Da quando si comincia ad addebitare");

  // Il conto che evita di far pagare due volte lo stesso mese. Le date sono
  // fisse apposta: un caso che dipende da che giorno e' oggi non e' un caso.
  const { daQuandoAddebitare } = await import("@/lib/stripe/checkout");
  const oggi = new Date("2026-08-21T12:00:00Z");
  const fra = (giorni: number) => new Date(oggi.getTime() + giorni * 86400000);
  const daQuando = (
    stato: string,
    date: { trialEndsAt?: Date | null; nextInvoiceAt?: Date | null },
    unaTantum = false
  ) =>
    daQuandoAddebitare(
      {
        status: stato,
        trialEndsAt: date.trialEndsAt ?? null,
        nextInvoiceAt: date.nextInvoiceAt ?? null,
      } as Parameters<typeof daQuandoAddebitare>[0],
      unaTantum,
      oggi
    ).trial_end ?? null;

  const fineProva = fra(30);
  ok(
    daQuando("prova", { trialEndsAt: fineProva }) === Math.floor(fineProva.getTime() / 1000),
    "chi e' in prova comincia a pagare quando la prova finisce"
  );

  // Il caso che mancava: attivo, con un mese gia' pagato davanti.
  const scadenza = fra(30);
  ok(
    daQuando("attivo", { nextInvoiceAt: scadenza }) === Math.floor(scadenza.getTime() / 1000),
    "chi e' gia' attivo comincia dalla sua prossima scadenza, non da oggi"
  );
  ok(
    daQuando("attivo", { nextInvoiceAt: fra(-5) }) === null,
    "se la scadenza e' passata si paga subito: e' un arretrato"
  );
  ok(
    daQuando("attivo", { nextInvoiceAt: fra(1) }) === null,
    "sotto i due giorni si paga subito: Stripe non accetta di meno"
  );
  ok(
    daQuando("sospeso", { nextInvoiceAt: fra(30) }) === null,
    "il sospeso paga subito: non ha coperto niente"
  );
  ok(
    daQuando("prova", { trialEndsAt: fra(30) }, true) === null,
    "con un'attivazione da incassare non si rimanda niente"
  );
  ok(
    daQuando("attivo", { trialEndsAt: fra(60), nextInvoiceAt: fra(30) }) ===
      Math.floor(fra(30).getTime() / 1000),
    "su un attivo vale la scadenza, anche se e' rimasta scritta una fine prova"
  );

  console.log("\n2. Locale nuovo");
  const creato = await createLocaleWithSetup({
    name: "Prova Stripe", slug, profile: "pub",
    ownerEmail: "stripe@example.com", ownerPassword: "prova1234",
    tableCount: 2,
  });
  ok(creato.ok, "creato");
  if (!creato.ok) throw new Error(creato.error);
  const tenantId = creato.tenantId;

  await salvaContratto(tenantId, {
    model: "abbonamento", pack: "locale", period: "mensile",
    recurringCents: 8900, activationCents: 0, transactionBps: 40,
    status: "prova", provider: "manuale", notes: null,
  });

  console.log("\n3. Il locale mette la carta");
  const clienteFinto = `cus_prova_${tenantId.slice(0, 8)}`;
  console.log(
    "  " +
      (await gestisciEvento(evento("checkout.session.completed", {
        id: "cs_test_prova",
        client_reference_id: tenantId,
        customer: clienteFinto,
        subscription: "sub_prova",
      })))
  );

  const agganciato = await getContratto(tenantId);
  ok(agganciato?.provider === "stripe", "il contratto passa a Stripe");
  ok(agganciato?.providerCustomerId === clienteFinto, "col cliente di la'");
  ok(agganciato?.providerSubscriptionId === "sub_prova", "e l'abbonamento");
  ok(
    agganciato?.status === "prova",
    "ma resta in prova: la carta e' una promessa, non un pagamento"
  );

  console.log("\n4. Il primo addebito");
  // Il lordo che paga il locale e il netto che arriva sul conto, come li manda
  // Stripe. Segnare il secondo sarebbe l'errore da non fare.
  const lordo = 8900;
  const commissione = 158;
  const quando = new Date("2026-03-10T09:00:00Z");
  console.log(
    "  " +
      (await gestisciEvento(evento("invoice.paid", {
        id: "in_prova_1",
        customer: clienteFinto,
        number: "A-0001",
        amount_paid: lordo,
        amount_due: lordo,
        status_transitions: { paid_at: Math.floor(quando.getTime() / 1000) },
      })))
  );

  const incassi = await db.select().from(payments).where(eq(payments.tenantId, tenantId));
  ok(incassi.length === 1, "un incasso registrato");
  ok(
    incassi[0]?.amountCents === lordo,
    `segna il lordo (${lordo}), non il netto (${lordo - commissione})`
  );
  ok(incassi[0]?.method === "stripe", "col metodo giusto");
  ok(incassi[0]?.providerRef === "in_prova_1", "e il riferimento di la'");
  ok(
    incassi[0]?.paidAt.getTime() === quando.getTime(),
    "con la data dell'incasso, non quella di adesso: il forfettario e' per cassa"
  );

  const attivo = await getContratto(tenantId);
  ok(attivo?.status === "attivo", "il primo incasso attiva il contratto");
  ok(attivo?.trialEndsAt === null, "e chiude la prova");
  ok(!!attivo?.startedAt, "segnando l'inizio del rapporto");
  ok(
    attivo?.nextInvoiceAt?.getMonth() === 3,
    "la prossima scadenza e' un mese dopo l'incasso, non un mese da oggi"
  );

  console.log("\n5. Lo stesso avviso, due volte");
  const secondaVolta = await gestisciEvento(evento("invoice.paid", {
    id: "in_prova_1",
    customer: clienteFinto,
    amount_paid: lordo,
    status_transitions: { paid_at: Math.floor(quando.getTime() / 1000) },
  }));
  console.log("  " + secondaVolta);
  const dopoIlDoppione = await db.select().from(payments).where(eq(payments.tenantId, tenantId));
  ok(
    dopoIlDoppione.length === 1,
    "Stripe che riprova non fa incassare due volte"
  );

  console.log("\n6. Avvisi che non ci riguardano");
  ok(
    (await gestisciEvento(evento("invoice.paid", {
      id: "in_altrui", customer: "cus_di_un_altro", amount_paid: 1000,
    }))).startsWith("ignorato"),
    "un cliente che non e' nostro non muove niente"
  );
  ok(
    (await gestisciEvento(evento("customer.created", { id: "cus_x" }))).startsWith("ignorato"),
    "un evento che non ascoltiamo non e' un errore"
  );

  console.log("\n7. Disdetta");
  console.log(
    "  " +
      (await gestisciEvento(evento("customer.subscription.deleted", {
        id: "sub_prova", customer: clienteFinto,
      })))
  );
  const disdetto = await getContratto(tenantId);
  ok(disdetto?.providerSubscriptionId === null, "l'abbonamento si stacca");
  ok(
    disdetto?.providerCustomerId === clienteFinto,
    "il cliente resta: e' lo stesso a cui si rivende"
  );
  ok(
    disdetto?.status === "attivo",
    "il contratto non si chiude da solo: chiudere un rapporto lo decido io"
  );

  console.log("\n7b. La prova allungata arriva anche a Stripe");
  const { allineaProvaSuStripe } = await import("@/lib/stripe/abbonamenti");
  ok(
    (await allineaProvaSuStripe(tenantId)).startsWith("nessun abbonamento"),
    "senza abbonamento aperto non c'e' niente da allineare"
  );

  if (stripeConfigurato() && stripeInProva()) {
    // Il giro vero: un abbonamento su Stripe con la prova che finisce quando
    // dice il contratto, la prova allungata dal pannello, e le due date che
    // devono restare la stessa. Se divergono il locale paga una prova che gli
    // e' stata regalata, e a scoprirlo e' lui.
    const Stripe = (await import("stripe")).default;
    const s = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const { impostaProva } = await import("@/lib/billing/contratti");

    await impostaProva(tenantId, 30);
    const a30 = (await getContratto(tenantId))!.trialEndsAt!;

    const cliente = await s.customers.create({ name: "Prova allunga" });
    const pm = await s.paymentMethods.attach("pm_card_visa", { customer: cliente.id });
    await s.customers.update(cliente.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const sub = await s.subscriptions.create({
      customer: cliente.id,
      items: [{
        price_data: {
          currency: "eur", product: prodottoId("locale", "abbonamento"),
          unit_amount: 8900, recurring: { interval: "month" },
        },
      }],
      trial_end: Math.floor(a30.getTime() / 1000),
    });
    await db
      .update(tenantBilling)
      .set({ providerCustomerId: cliente.id, providerSubscriptionId: sub.id })
      .where(eq(tenantBilling.tenantId, tenantId));

    const suStripe = async () => {
      const x = await s.subscriptions.retrieve(sub.id);
      return x.trial_end ? new Date(x.trial_end * 1000).toISOString().slice(0, 10) : null;
    };
    ok(
      (await suStripe()) === a30.toISOString().slice(0, 10),
      "l'abbonamento nasce con la fine prova che dice il contratto"
    );

    await impostaProva(tenantId, 60);
    const esito = await allineaProvaSuStripe(tenantId);
    const a60 = (await getContratto(tenantId))!.trialEndsAt!.toISOString().slice(0, 10);
    ok(
      (await suStripe()) === a60,
      `allungata a 60 giorni, Stripe la sposta con noi (${esito})`
    );

    console.log("\n7c. Disdetta e ripensamento");
    const { disdiciAbbonamento, riattivaAbbonamento, chiudiAbbonamentoSuStripe } =
      await import("@/lib/stripe/abbonamenti");

    const esitoDisdetta = await disdiciAbbonamento(tenantId);
    const disdettoDb = (await getContratto(tenantId))!.providerCancelAt;
    const disdettoLa = (await s.subscriptions.retrieve(sub.id)).cancel_at_period_end;
    ok(disdettoLa === true, `Stripe la registra (${esitoDisdetta})`);
    ok(!!disdettoDb, "e la data di fine si scrive subito, senza aspettare l'avviso");
    ok(
      (await getContratto(tenantId))!.providerSubscriptionId === sub.id,
      "l'abbonamento resta vivo: disdire non e' sparire, vale a fine periodo"
    );

    // L'avviso che Stripe manda davvero quando si disdice: non "deleted" ma
    // "updated". E' quello che fa sapere della disdetta il giorno stesso.
    const daStripe = await s.subscriptions.retrieve(sub.id);
    console.log(
      "  " +
        (await gestisciEvento(evento("customer.subscription.updated", {
          id: sub.id,
          customer: cliente.id,
          cancel_at_period_end: true,
          cancel_at: daStripe.cancel_at,
        })))
    );
    ok(
      !!(await getContratto(tenantId))!.providerCancelAt,
      "l'avviso di Stripe conferma la stessa data"
    );

    await riattivaAbbonamento(tenantId);
    ok(
      (await s.subscriptions.retrieve(sub.id)).cancel_at_period_end === false,
      "ci ripensa e il rinnovo riparte"
    );
    ok(
      (await getContratto(tenantId))!.providerCancelAt === null,
      "e la data di fine sparisce"
    );

    console.log("\n7d. Il contratto chiuso chiude anche l'abbonamento");
    console.log("  " + (await chiudiAbbonamentoSuStripe(tenantId)));
    ok(
      (await s.subscriptions.retrieve(sub.id)).status === "canceled",
      "chiudere il rapporto ferma l'addebito: niente soldi presi a un cliente che non c'e' piu'"
    );

    await s.customers.del(cliente.id);
    await db
      .update(tenantBilling)
      .set({
        providerCustomerId: null,
        providerSubscriptionId: null,
        providerCancelAt: null,
      })
      .where(eq(tenantBilling.tenantId, tenantId));
  } else {
    console.log("  --   il giro vero serve una chiave di prova: saltato.");
  }

  console.log("\n8. Stripe vero");
  if (!stripeConfigurato()) {
    console.log(
      "  --   STRIPE_SECRET_KEY non c'e': saltata.\n" +
        "       Mettila in .env.local e rilancia per provare il pagamento vero."
    );
  } else if (!stripeInProva()) {
    console.log("  --   la chiave e' di produzione: saltata, qui non si aprono abbonamenti veri.");
  } else {
    // Rimesso com'era prima della disdetta finta, altrimenti Checkout si
    // rifiuta di aprirne un altro.
    await db
      .update(tenantBilling)
      .set({ providerCustomerId: null, providerSubscriptionId: null, status: "prova" })
      .where(eq(tenantBilling.tenantId, tenantId));

    const { creaSessioneAbbonamento } = await import("@/lib/stripe/checkout");
    const base = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.startsWith("localhost")
      ? `http://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
      : `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`;
    const url = await creaSessioneAbbonamento(tenantId, {
      successUrl: `${base}/dashboard/fatturazione?pagato=1`,
      cancelUrl: `${base}/dashboard/fatturazione`,
    });
    ok(url.startsWith("https://"), "Stripe ha aperto la pagina di pagamento");
    console.log(
      "\n  Aprila e paga con la carta di prova 4242 4242 4242 4242,\n" +
        "  scadenza qualsiasi nel futuro, CVC qualsiasi:\n\n  " + url +
        "\n\n  L'incasso arriva solo se il webhook e' in ascolto. In locale:\n" +
        "    stripe listen --forward-to localhost:3000/api/stripe/webhook\n"
    );
    console.log("  Il locale finto NON viene cancellato, cosi' si puo' pagare davvero.");
    console.log(`  Per toglierlo dopo:  npx tsx scripts/prova-stripe.ts --pulisci\n`);
    console.log(`\n${passati} ok, ${falliti} da guardare\n`);
    process.exit(falliti ? 1 : 0);
  }

  console.log("\n9. Pulizia");
  await pulisci();
  const restano = await db.select().from(tenantBilling).where(eq(tenantBilling.tenantId, tenantId));
  ok(restano.length === 0, "il locale finto e il suo contratto sono spariti");

  console.log(`\n${passati} ok, ${falliti} da guardare\n`);
  process.exit(falliti ? 1 : 0);
}

// Un avviso di Stripe come arriverebbe dal webhook, ridotto ai campi che
// guardiamo. Il cast e' inevitabile — l'oggetto vero ha sessanta campi, e
// riempirli tutti non proverebbe niente di piu'.
function evento(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_prova_${type}`, type, data: { object } } as unknown as Stripe.Event;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
