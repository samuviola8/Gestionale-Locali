import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  unique,
  jsonb,
  index,
  uniqueIndex,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Schema database.

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  customDomain: text("custom_domain").unique(),
  suspended: boolean("suspended").notNull().default(false),

  // Servizio spento perche' il conto non torna: fattura scaduta oltre la
  // tolleranza, o prova finita. Sta a parte da `suspended` — quello e' la mia
  // mano sull'interruttore e chiude tutto, login compreso. Questo lascia
  // entrare il titolare, che deve poter vedere cosa deve e pagarlo.
  serviceBlocked: boolean("service_blocked").notNull().default(false),
  // morosita | prova_scaduta
  blockedReason: text("blocked_reason"),

  // Anagrafica del locale: serve in fase di onboarding e sui documenti.
  legalName: text("legal_name"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  phone: text("phone"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),

  // Dati che servono a fatturare l'abbonamento al locale. Restano vuoti
  // finche' non si firma: un locale in prova non ha ancora niente da pagare.
  // Il codice destinatario e la PEC sono alternativi — lo SDI si accontenta
  // di uno dei due — ma qui stanno tutti e due perche' il commercialista del
  // locale dara' quello che gli viene comodo, e chiederglielo due volte no.
  vatNumber: text("vat_number"),
  taxCode: text("tax_code"),
  sdiCode: text("sdi_code"),
  pecEmail: text("pec_email"),
  // Dove arrivano i documenti. Spesso non e' la mail di chi lavora in sala.
  billingEmail: text("billing_email"),
  notes: text("notes"),
  // Dove sta il locale, ricavate una volta sola dall'indirizzo. Servono a
  // cercare gli indirizzi di consegna intorno a lui: una consegna e' quasi
  // sempre a pochi chilometri, e "Via Roma" esiste in ogni comune d'Italia.
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),

  // Branding: il preset vive nel codice (lib/themes.ts), qui solo la scelta
  // e gli scostamenti del singolo locale. Null = usa il valore del preset.
  themePreset: text("theme_preset").notNull().default("default"),
  brandColor: text("brand_color"),
  brandAccent: text("brand_accent"),
  logoUrl: text("logo_url"),
  // "dark" | "light" | "system": default proposto al cliente al primo accesso.
  defaultTheme: text("default_theme").notNull().default("system"),

  // Skin del menu: decide SOLO come si presenta la pagina cliente (layout,
  // animazioni, accenti). La logica di ordine e carrello e' la stessa per tutti.
  menuSkin: text("menu_skin").notNull().default("base"),

  // La riga "Menu con Comanda" in fondo alla pagina del cliente. Accesa
  // dappertutto: quel menu e' l'unico posto con del passaggio vero, ed e' li'
  // che il titolare del locale di fronte scopre che il prodotto esiste. Si
  // spegne per chi non la vuole, ed e' una cosa che si concede, non che si
  // regala al primo sopracciglio alzato.
  menuBranding: boolean("menu_branding").notNull().default(true),

  // Durata della sessione tavolo aperta scansionando il QR.
  tableSessionMinutes: integer("table_session_minutes").notNull().default(120),

  // Coperto: prezzo fisso a persona, addebitato a ciascun commensale.
  // 0 = il locale non lo applica.
  coverChargeCents: integer("cover_charge_cents").notNull().default(0),

  // Come si fa sentire una chiamata dal tavolo. Il suono e' un nome, non un
  // file: lo genera il browser (lib/suoni.ts). "muto" = solo a schermo, per
  // chi lavora in sala con la musica alta o in un locale dove un trillo ogni
  // due minuti darebbe fastidio ai clienti al bancone.
  callSound: text("call_sound").notNull().default("campanello"),
  // La campanella lampeggia finche' la chiamata non e' presa. Il pallino
  // rosso da solo si confonde con lo sfondo di uno schermo guardato di
  // sfuggita da tre metri.
  callBlink: boolean("call_blink").notNull().default(true),

  // Impostazioni di stampa. Stanno qui e non in una tabella a parte perche'
  // sono una manciata di interruttori di un solo locale, non una collezione.
  // Quali abbiano senso lo decidono i moduli attivi: senza asporto, l'opzione
  // "stampa le comande d'asporto" non deve nemmeno comparire.
  printComandaTavolo: boolean("print_comanda_tavolo").notNull().default(false),
  printComandaBanco: boolean("print_comanda_banco").notNull().default(false),
  printComandaAsporto: boolean("print_comanda_asporto").notNull().default(false),
  printComandaDomicilio: boolean("print_comanda_domicilio")
    .notNull()
    .default(false),
  // Scontrino del conto alla chiusura del tavolo, oltre che a richiesta.
  printContoAllaChiusura: boolean("print_conto_alla_chiusura")
    .notNull()
    .default(false),
  // Scontrino per gli ordini battuti in cassa. E' il valore di partenza della
  // spunta: l'operatore lo forza ordine per ordine, perche' chi paga un caffe'
  // di solito lo scontrino non lo vuole e chi porta a casa la cena si'.
  printScontrinoCassa: boolean("print_scontrino_cassa")
    .notNull()
    .default(false),

  // Orari di apertura per giorno della settimana, a intervalli. Da qui si
  // ricavano le fasce di ritiro e quelle di prenotazione: senza, l'unica
  // alternativa e' una finestra inventata, che propone consegne a serranda
  // abbassata.
  // { "0": [{ "da": "12:00", "a": "15:00" }, { "da": "19:00", "a": "23:30" }] }
  openingHours: jsonb("opening_hours").notNull().default(sql`'{}'::jsonb`),
  // Le chiusure a data fissa: feste, ferie, giornate storte. Stanno a parte
  // dagli orari perche' non sono un giorno della settimana ma un pezzo di
  // calendario, e perche' cosi' gli orari gia' salvati restano come sono.
  closureDays: jsonb("closure_days").notNull().default(sql`'[]'::jsonb`),

  // Prenotazione del tavolo dal web. Come per la stampa, sono i pochi numeri
  // di un locale solo e non una collezione: stanno qui e non in una tabella a
  // parte. Hanno senso solo col modulo `reservations` acceso.
  // Ogni quanto si propone una fascia: 30 minuti e' il passo con cui la gente
  // ragiona ("alle otto e mezza"), 15 lo si usa dove il turno e' stretto.
  reservationSlotMinutes: integer("reservation_slot_minutes").notNull().default(30),
  // Quanto resta occupato il tavolo. E' l'unica cosa che decide quanti
  // coperti entrano in una sera: troppo corto e la gente si accavalla, troppo
  // lungo e la sala risulta piena mentre e' mezza vuota.
  reservationDurationMinutes: integer("reservation_duration_minutes")
    .notNull()
    .default(105),
  reservationMinParty: integer("reservation_min_party").notNull().default(1),
  // Oltre questo numero la prenotazione online non si prende: i gruppi grandi
  // si concordano a voce, perche' quasi sempre portano un menu concordato.
  reservationMaxParty: integer("reservation_max_party").notNull().default(8),
  // Preavviso minimo: nessuno prenota per "fra cinque minuti", e una richiesta
  // che arriva mentre il gruppo e' gia' sulla porta non la legge nessuno.
  reservationLeadMinutes: integer("reservation_lead_minutes").notNull().default(120),
  reservationHorizonDays: integer("reservation_horizon_days").notNull().default(30),
  // Con la conferma automatica il tavolo e' preso appena il cliente invia e la
  // mail parte da sola; senza, resta una richiesta finche' il locale non
  // risponde — e allora e' l'operatore a confermarla, spostarla o rifiutarla.
  reservationAutoConfirm: boolean("reservation_auto_confirm")
    .notNull()
    .default(true),
  // Quanti tavoli si possono accostare per un gruppo solo. La sala non e' fatta
  // di posti fissi: cinque tavoli da due diventano un tavolo da dieci, e il
  // limite vero e' quanti se ne riescono a spostare — non quanti ne esistono.
  // 1 = i tavoli non si uniscono.
  reservationMaxJoin: integer("reservation_max_join").notNull().default(3),
  // Sedie che si possono aggiungere a un tavolo. Un tavolo da due diventa da
  // tre con una sedia in piu': senza questo numero il sistema rifiuterebbe il
  // terzo commensale mentre in sala ci sta comodo.
  reservationExtraSeats: integer("reservation_extra_seats").notNull().default(0),

  // Ordini dal web: asporto e domicilio ordinati dal cliente sul sito del
  // locale, senza telefonare. Come per la prenotazione sono i pochi numeri di
  // un locale solo e stanno qui, non in una tabella a parte.
  //
  // Le regole stanno in un blocco per canale, perche' i due canali quasi niente
  // ce l'hanno in comune:
  //
  //   { "asporto":   { "attivo": true, "passoMinuti": 15, "preavvisoMinuti": 20,
  //                    "giorniAvanti": 7, "minimoCents": 0,
  //                    "accettazioneAutomatica": false, "nota": null },
  //     "domicilio": { ... } }
  //
  // In jsonb e non in una colonna per numero: sono le stesse sette voci per
  // ogni canale, e il giorno che se ne aggiunge un terzo — il ritiro al banco,
  // per dirne una — sarebbero altre sette colonne e una migrazione. Quello che
  // ci finisce dentro lo ripulisce `normalizzaCanale`, in scrittura e in
  // lettura: qui dentro un numero storto non da' errore, si traduce in una
  // pagina che non propone piu' niente.
  //
  // Il canale acceso qui e' un'altra cosa dal modulo: il modulo dice che il
  // locale fa asporto, questo che lo prende anche dal web. Chi gli ordini li
  // vuole solo al telefono tiene il modulo acceso e questo spento.
  webOrderChannels: jsonb("web_order_channels")
    .notNull()
    .default(sql`'{}'::jsonb`),
  // Quanti pezzi tiene una fascia: e' la capienza della cucina, e per questo e'
  // l'unica cosa che i due canali si dividono. Il forno e' lo stesso, e due
  // tetti separati direbbero venti dove il numero vero e' dieci. 0 = nessun
  // tetto, per chi vuole vedere quanti ne arrivano prima di mettere un limite.
  webOrderPiecesPerSlot: integer("web_order_pieces_per_slot")
    .notNull()
    .default(0),
  // Fino a quando gli ordini dal web sono sospesi. E' l'interruttore del
  // sabato sera: la cucina e' in ginocchio e si chiude il rubinetto senza
  // spegnere niente di configurato. Si mette a fine giornata e non a mano,
  // perche' un interruttore che si riapre da solo la mattina dopo e' l'unico
  // che non lascia un locale chiuso al web per una settimana per dimenticanza.
  webOrdersPausedUntil: timestamp("web_orders_paused_until", {
    withTimezone: true,
  }),

  // Le fasce di consegna: "fino a X km, costo Y, minimo d'ordine Z", in ordine
  // di distanza. Una riga sola vuol dire costo fisso per tutti; oltre l'ultima
  // non si consegna. Stanno in jsonb come le chiusure — sono due o tre righe di
  // un locale solo, non una collezione da interrogare.
  //
  // La distanza serve comunque, anche a chi mette il costo fisso: e' lei a dire
  // fin dove si va. Senza, un locale con la consegna a 3 euro si prenderebbe un
  // ordine a quaranta chilometri.
  deliveryBands: jsonb("delivery_bands").notNull().default(sql`'[]'::jsonb`),
  // Sopra questo importo la consegna e' offerta. 0 = si paga sempre. Il minimo
  // d'ordine della fascia vale lo stesso: regalare il viaggio non vuol dire
  // uscire per otto euro di spesa.
  deliveryFreeOverCents: integer("delivery_free_over_cents")
    .notNull()
    .default(0),

  // Posta del locale. Le conferme di prenotazione partono dalla sua casella,
  // non dalla nostra: il cliente ha prenotato dal ristorante, e la risposta
  // deve arrivare — e potersi rigirare — da li'. La password e' una "password
  // per applicazione" e sta cifrata (lib/segreti.ts), mai in chiaro.
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").notNull().default(465),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  // Riga mostrata al cliente prima di confermare: "cuciniamo su prenotazione",
  // "il tavolo si tiene 15 minuti". Ogni locale ha la sua.
  reservationNote: text("reservation_note"),

  // Secondo fattore obbligatorio per chi entra in questa dashboard. Lo decide
  // il super-admin: il titolare puo' attivarselo da solo, ma non puo'
  // toglierselo se il locale lo richiede.
  twofaRequired: boolean("twofa_required").notNull().default(false),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Moduli attivi per locale. Il catalogo dei moduli vive in lib/modules.ts:
// qui si registra solo lo stato per tenant, cosi' aggiungere un modulo nuovo
// non richiede una migrazione.
export const tenantModules = pgTable(
  "tenant_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    config: jsonb("config"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tenantId, table.moduleKey)]
);

export const restaurantTables = pgTable(
  "restaurant_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    token: text("token").notNull(),
    // Quante persone ci stanno sedute. Serve alla prenotazione: senza, il
    // sistema non sa se il gruppo di sei entra o va rifiutato. Due e' il
    // valore prudente di partenza — meglio rifiutare che scoprire in sala che
    // il tavolo era piccolo.
    seats: integer("seats").notNull().default(2),
    // Prenotabile dal web. Il bancone e i due sgabelli all'ingresso esistono
    // come tavoli per il QR, ma non si danno a chi prenota.
    bookable: boolean("bookable").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tenantId, table.number)]
);

// Prenotazione di un tavolo, presa dal web o scritta dallo staff al telefono.
//
// Non e' un ordine: nasce prima, non ha consumazioni e vive anche se quella
// sera il cliente non si presenta. Quando il gruppo arriva, lo staff lo segna
// "arrivato" e da li' in poi il tavolo lavora come sempre, col suo QR.
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Quando si siedono. La durata non e' qui: e' un'impostazione del locale
    // che puo' cambiare, e congelarla su ogni riga renderebbe impossibile
    // correggere l'unica cosa che regola il ricambio dei tavoli.
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    partySize: integer("party_size").notNull(),
    // I tavoli assegnati, per numero e non per id: e' l'identificativo che
    // usano gia' gli ordini e il conto, ed e' quello che lo staff legge in
    // sala. Piu' di uno quando il gruppo non sta in un tavolo solo.
    tableNumbers: integer("table_numbers")
      .array()
      .notNull()
      .default(sql`'{}'`),
    customerName: text("customer_name").notNull(),
    // Il telefono e' l'unico modo per avvisare che il tavolo salta: si chiede
    // sempre, anche allo staff che prende la prenotazione a voce.
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    notes: text("notes"),
    // pending | confirmed | proposed | seated | cancelled | no_show
    // "pending" esiste solo dove il locale non ha la conferma automatica: il
    // tavolo e' comunque tenuto occupato, altrimenti si accetterebbero due
    // gruppi sullo stesso posto mentre si decide. "proposed" e' una
    // prenotazione che il locale ha spostato: vale gia' il nuovo orario, ma
    // finche' il cliente non accetta resta scritto che non l'ha ancora fatto.
    status: text("status").notNull().default("confirmed"),
    // L'orario che il cliente aveva chiesto prima dello spostamento. Serve a
    // dirgli cosa e' cambiato invece di mostrargli una prenotazione diversa da
    // quella che ricordava, senza spiegazioni.
    previousStartsAt: timestamp("previous_starts_at", { withTimezone: true }),
    // Quando gli e' partita l'ultima mail. Una conferma che il cliente non ha
    // mai ricevuto e' una prenotazione che non sa di avere.
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    // web | staff. Serve a distinguere chi ha prenotato da solo da chi ha
    // telefonato: sono due qualita' di dato diverse quando qualcosa non torna.
    source: text("source").notNull().default("web"),
    // Il link che torna al cliente. E' l'unica cosa che gli permette di
    // rivedere o disdire la prenotazione senza un account.
    token: text("token").notNull().unique(),
    seatedAt: timestamp("seated_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("reservations_tenant_start_idx").on(table.tenantId, table.startsAt)]
);

// Postazione di preparazione: cucina, pizzeria, bar. Le comande si smistano
// per reparto e non per persona, perche' il personale ruota e alla stessa
// postazione ci stanno in due: legare le categorie a un nome proprio vuol dire
// che il giorno che quello e' a casa la pizza non arriva a nessuno.
export const reparti = pgTable("reparti", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  // Chi prepara questa categoria. Nullo = nessuno in particolare: le sue voci
  // restano nella coda generale invece di sparire in un reparto inesistente.
  repartoId: uuid("reparto_id").references(() => reparti.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const menuProducts = pgTable("menu_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id")
    .notNull()
    .references(() => menuCategories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  ingredients: text("ingredients")
    .array()
    .notNull()
    .default(sql`'{}'`),
  allergens: text("allergens")
    .array()
    .notNull()
    .default(sql`'{}'`),
  priceCents: integer("price_cents").notNull(),
  available: boolean("available").notNull().default(true),
  // In cima alla cassa al banco. Su un menu da centocinquanta voci l'operatore
  // non puo' cercare: i dieci piu' richiesti devono stare sotto al dito.
  pinned: boolean("pinned").notNull().default(false),
  // Il cliente scrive cosa vuole invece di scegliere: e' il "cocktail su
  // richiesta". Il prezzo qui e' quello di partenza, il barman puo' correggerlo
  // sulla singola riga d'ordine.
  acceptsNote: boolean("accepts_note").notNull().default(false),
  // Si serve in bottiglia: prima di metterlo nel carrello si chiede quanti
  // calici portare. "In quanti siete" non e' la risposta — al tavolo da sei il
  // vino magari lo bevono in due, e chi ha gia' il calice davanti non ne vuole
  // un altro.
  requiresGlasses: boolean("requires_glasses").notNull().default(false),
  // Cosa esce dal locale. Non tutto il menu si porta a casa: il cocktail
  // versato non viaggia, la birra alla spina nemmeno, il fritto a domicilio
  // arriva molle. Accesi di default perche' la regola e' che si porta via:
  // spegnere venti prodotti e' lavoro, accenderne centoquaranta e' una
  // giornata, e un menu tutto spento non lo accende nessuno.
  takeawayAvailable: boolean("takeaway_available").notNull().default(true),
  deliveryAvailable: boolean("delivery_available").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Formati alternativi dello stesso prodotto: "Porzione"/"Shot" per i
// distillati, "Piccola"/"Media" per le birre. Un prodotto senza varianti usa
// il proprio price_cents e si ordina con un tocco solo.
export const menuProductVariants = pgTable(
  "menu_product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => menuProducts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    available: boolean("available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.productId, table.name)]
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    // owner | staff | reparto. Chi e' di un reparto vede solo la propria coda:
    // al pizzaiolo non serve il conto del tavolo 7.
    role: text("role").notNull().default("staff"),
    repartoId: uuid("reparto_id").references(() => reparti.id, {
      onDelete: "set null",
    }),

    // Password temporanea: quella che arriva per mail dopo un invito o un
    // reset. Vale per entrare una volta e basta — al primo accesso la
    // dashboard non si apre finche' non ne viene scelta una nuova, cosi' la
    // password che ha viaggiato in chiaro nella posta non resta quella vera.
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    // Oltre questa data la temporanea non entra piu': una mail di reset letta
    // sei mesi dopo non deve essere ancora una chiave buona.
    tempPasswordUntil: timestamp("temp_password_until", { withTimezone: true }),

    // Secondo fattore: null = spento, "totp" = app di autenticazione,
    // "email" = codice mandato alla casella. Il segreto serve solo al TOTP e
    // sta cifrato (lib/segreti.ts): a database e' inservibile da solo.
    twofaMethod: text("twofa_method"),
    twofaSecret: text("twofa_secret"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.tenantId, table.email)]
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // Nullo fuori dalla sala: al banco, in asporto e a domicilio non c'e' nessun
  // tavolo, e inventarne uno vorrebbe dire un posto per ogni ordine in
  // contemporanea. Il canale dice sempre come leggere questa riga.
  tableNumber: integer("table_number"),
  channel: text("channel").notNull().default("tavolo"),
  // pending | new | preparing | served.
  //
  // "pending" nasce solo dal web, dove l'ordine lo accetta una persona: non e'
  // ancora roba da preparare, non entra in coda, non e' un conto aperto e la
  // comanda non parte. Tutto quello che nasce dentro al locale parte da "new",
  // perche' chi l'ha battuto l'ha gia' accettato battendolo.
  status: text("status").notNull().default("new"),
  // Quante persone sono sedute al tavolo. Serve per dividere le voci
  // condivise e per contare i coperti; lo dichiara il cliente alla prima
  // consumazione condivisa, lo staff puo' correggerlo dal conto.
  partySize: integer("party_size"),
  // Chi ritira o a chi si consegna. Fuori dalla sala il conto non ha un numero
  // di tavolo per farsi riconoscere: ha un nome.
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  // Dove mandare la conferma di un ordine arrivato dal sito. Si chiede solo
  // dove il locale ha la posta configurata: chiederla per non mandare niente
  // e' raccogliere un indirizzo per niente.
  customerEmail: text("customer_email"),
  customerAddress: text("customer_address"),
  // Consegna: e' un servizio, non una consumazione, quindi non e' una riga
  // d'ordine e non deve finire nella comanda che arriva in cucina.
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  // Quando il cliente passa a ritirare, o quando va consegnato.
  dueAt: timestamp("due_at", { withTimezone: true }),
  // Il link con cui chi ha ordinato dal sito rivede il suo ordine e ne segue
  // lo stato: e' l'unica cosa che glielo fa ritrovare senza un account. Nullo
  // su tutto quello che nasce dentro al locale.
  webToken: text("web_token").unique(),
  // Quanti chilometri per arrivarci. E' il numero da cui e' uscito il costo di
  // consegna, e sta scritto sull'ordine perche' chi lo accetta possa dargli
  // un'occhiata: dove la linea d'aria mente — il fiume, la tangenziale — il
  // costo lo corregge lui. Nullo = l'indirizzo non si e' trovato sulla mappa,
  // e allora il costo lo decide il locale.
  deliveryKm: doublePrecision("delivery_km"),
  // I due momenti che al cliente interessano davvero, e che dallo stato non si
  // ricavano: quando la sua roba e' **pronta** e quando **e' uscita** dal
  // locale. Sono eventi con un'ora, non stati: "pronto alle 20:28" e "partito
  // alle 20:35" sono quello che uno vuole leggere mentre aspetta, e tenerli
  // come date invece che dentro `status` lascia in pace la macchina degli
  // stati della cucina, che conta le righe e non i giri del fattorino.
  readyAt: timestamp("ready_at", { withTimezone: true }),
  outAt: timestamp("out_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => menuProducts.id, {
    onDelete: "set null",
  }),
  variantId: uuid("variant_id").references(() => menuProductVariants.id, {
    onDelete: "set null",
  }),
  // Snapshot: nome e prezzo restano quelli del momento dell'ordine, anche se
  // il menu cambia dopo. Per una variante il nome include il formato.
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
  quantity: integer("quantity").notNull().default(1),
  // Cosa ha chiesto il cliente a parole, per i prodotti su richiesta.
  note: text("note"),
  // Quanti calici servono con questa riga. Nullo = il prodotto non li chiede,
  // 0 = li hanno gia' in tavolo. Sta qui e non dentro la nota perche' non e'
  // una richiesta del cliente ma una quantita' di servizio: nella nota
  // finirebbe tra le richieste vere, quelle che il locale rilegge per capire
  // cosa manca a menu.
  glasses: integer("glasses"),
  // Segnato quando il barman corregge il prezzo di questa riga: serve a
  // dirlo al cliente invece di cambiargli il conto in silenzio.
  priceAdjusted: boolean("price_adjusted").notNull().default(false),
  // Voce tolta dal conto perche' il prodotto e' finito o l'ordine era sbagliato.
  // Si annulla, non si cancella: la riga resta barrata sotto gli occhi di tutti,
  // altrimenti al cliente il totale cambierebbe senza spiegazione e in cassa
  // resterebbe un buco che nessuno sa ricostruire.
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  // Chi deve preparare questa voce, congelato al momento dell'ordine: se domani
  // la categoria passa a un altro reparto, la comanda gia' partita non cambia
  // padrone a meta' servizio.
  repartoId: uuid("reparto_id").references(() => reparti.id, {
    onDelete: "set null",
  }),
  // Lo stato sta sulla riga e non sull'ordine: con due reparti la pizza puo'
  // essere pronta e il cocktail no, e un solo stato per ordine mentirebbe su
  // uno dei due. new | preparing | done
  status: text("status").notNull().default("new"),
  alias: text("alias"),
  paid: boolean("paid").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Quota condivisa e coperto non sono righe d'ordine: si calcolano sul conto.
// Qui si registra chi li ha gia' saldati, altrimenti incassare una persona
// lascerebbe la sua parte di condiviso senza traccia. Le righe spariscono
// alla chiusura del tavolo.
export const billSettlements = pgTable(
  "bill_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tableNumber: integer("table_number").notNull(),
    alias: text("alias").notNull(),
    // Quanto ha effettivamente pagato. Congelarlo evita che, cambiando dopo
    // il numero di persone, cambi anche quello che uno ha gia' versato.
    amountCents: integer("amount_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [unique().on(table.tenantId, table.tableNumber, table.alias)]
);

// Tavolo archiviato. Serve perche' alla chiusura le righe di bill_settlements
// spariscono, e con loro l'unica traccia del coperto incassato: le consumazioni
// restano in order_items, il coperto no. Ricalcolarlo dopo dal partySize
// darebbe numeri che cambiano ogni volta che il locale ritocca la tariffa, e un
// incasso sbagliato e' peggio di un incasso assente. Qui la tariffa si congela.
export const tableClosures = pgTable("table_closures", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  tableNumber: integer("table_number").notNull(),
  // Quante persone erano sedute: e' anche il numero di coperti serviti, dato
  // che dagli ordini non si ricava senza contare piu' volte lo stesso tavolo.
  partySize: integer("party_size").notNull().default(0),
  coverChargeCents: integer("cover_charge_cents").notNull().default(0),
  closedAt: timestamp("closed_at", { withTimezone: true }).defaultNow().notNull(),
});

// Lavoro di stampa in attesa. Esiste perche' un ordine nasce sul telefono del
// cliente, dove non c'e' nessuna stampante: qualcuno al locale deve venirselo
// a prendere. Il giorno che si passa a stampanti che interrogano loro il
// server cambia chi svuota questa coda, non il resto.
export const printJobs = pgTable("print_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // Nullo per lo scontrino del conto, che non e' di nessun reparto.
  repartoId: uuid("reparto_id").references(() => reparti.id, {
    onDelete: "set null",
  }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  // comanda | conto
  kind: text("kind").notNull().default("comanda"),
  // Cosa stampare, congelato adesso: una ristampa deve mostrare quello che era
  // stato mandato in cucina, non l'ordine com'e' diventato dopo.
  payload: jsonb("payload").notNull(),
  printedAt: timestamp("printed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Gestore del servizio (super-admin), separato dagli utenti dei locali.
export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Stessa storia degli account dei locali, vedi `users`. Qui pesa di piu':
  // questo account vede tutti i locali insieme.
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  tempPasswordUntil: timestamp("temp_password_until", { withTimezone: true }),
  twofaMethod: text("twofa_method"),
  twofaSecret: text("twofa_secret"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// "Ho perso la password": la richiesta, non ancora la nuova password.
//
// Chiedere il recupero non deve cambiare niente. Se bastasse la richiesta a
// far ripartire la password, chiunque conosca l'indirizzo del titolare
// potrebbe buttarlo fuori dal suo locale a ripetizione, di sabato sera. Qui si
// segna solo che qualcuno ha chiesto: la password cambia quando si apre il
// link, e allora si sa che chi ha chiesto e' chi legge quella casella.
//
// Del link resta l'impronta e non il link: chi si porta via il database non
// deve trovarci dentro delle chiavi ancora buone.
export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  // "user" | "admin", come per le sfide qui sotto.
  scope: text("scope").notNull(),
  subjectId: uuid("subject_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Quando e' stato speso. Un link vale una volta sola: la mail resta in
  // casella per anni, e una casella si perde.
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Il login superato a meta': password giusta, secondo fattore ancora da dare.
// Sta a database e non in un cookie firmato perche' cosi' il codice mandato
// per mail si puo' consumare una volta sola e i tentativi si contano davvero.
//
// `subjectId` non ha una chiave esterna: punta a `users` o a `platform_admins`
// a seconda di `scope`, e Postgres non sa fare un vincolo verso due tabelle.
// Le righe orfane non fanno danno — scadono in pochi minuti e la verifica
// ricarica sempre l'account dal suo tavolo.
export const loginChallenges = pgTable("login_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  // "user" | "admin"
  scope: text("scope").notNull(),
  subjectId: uuid("subject_id").notNull(),
  token: text("token").notNull().unique(),
  // "totp" | "email"
  method: text("method").notNull(),
  // Solo per i codici via mail, e sotto hash: chi legge il database non deve
  // poter leggere il codice che sta arrivando alla casella di qualcun altro.
  codeHash: text("code_hash"),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminId: uuid("admin_id")
    .notNull()
    .references(() => platformAdmins.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Sessione aperta scansionando il QR del tavolo. Ha una scadenza: quando
// scade il cliente deve riscansionare il codice, cosi' il link non resta
// valido per sempre una volta uscito dal locale.
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tableId: uuid("table_id")
      .notNull()
      .references(() => restaurantTables.id, { onDelete: "cascade" }),
    tableNumber: integer("table_number").notNull(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Valorizzato quando lo staff chiude il conto: invalida i telefoni al tavolo.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("table_sessions_tenant_table_idx").on(table.tenantId, table.tableNumber)]
);

// Un gruppo seduto in sala, e su quali tavoli sta.
//
// La prenotazione sa gia' accostare due tavoli per un gruppo che non entra in
// uno solo. In sala pero' la stessa cosa capita senza che nessuno abbia
// prenotato: arrivano in sei, il cameriere tira di fianco il tavolo libero, e
// da quel momento i due tavoli sono un tavolo solo. Se non e' scritto da
// nessuna parte, il secondo risulta libero: qualcuno ci fa accomodare altra
// gente, o gli apre un secondo conto che poi va incassato due volte.
//
// Vale anche per un tavolo solo, ed e' il caso piu' banale: dire "qui c'e'
// gente" prima che ordinino. E' l'unico momento in cui il sistema, da solo,
// non puo' saperlo — un tavolo senza ordini e senza QR scansionato e'
// indistinguibile da un tavolo vuoto.
export const tableSittings = pgTable(
  "table_sittings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // I tavoli di questo gruppo, per numero: e' l'identificativo che usano
    // gia' gli ordini, il conto e la prenotazione.
    tableNumbers: integer("table_numbers")
      .array()
      .notNull()
      .default(sql`'{}'`),
    // Il capofila: il tavolo su cui si raccoglie il conto quando sono piu'
    // d'uno. Sta scritto e non si ricava dall'elenco perche' e' il numero che
    // gli ordini si portano su ogni riga: dedurlo di nuovo, il giorno che
    // l'elenco cambia, vorrebbe dire spostare un conto gia' aperto.
    mainTable: integer("main_table").notNull(),
    // Quante persone si sono sedute, quando lo staff lo sa gia'. Serve alla
    // vista della sala prima che ordinino: dal conto il numero si ricava solo
    // dalla prima consumazione in poi.
    partySize: integer("party_size"),
    // La prenotazione da cui nasce, quando il gruppo era atteso.
    reservationId: uuid("reservation_id").references(() => reservations.id, {
      onDelete: "set null",
    }),
    openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
    // Chiusa quando si incassa il conto o quando i tavoli si separano. Non si
    // cancella: e' la traccia di quanto e' rimasto seduto quel gruppo, cioe'
    // l'unico modo per sapere dopo quanto tempo gira un tavolo.
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("table_sittings_tenant_open_idx").on(table.tenantId, table.closedAt),
  ]
);

// Chiamate del cameriere al tavolo (separate dagli ordini).
export const waiterCalls = pgTable("waiter_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  tableNumber: integer("table_number").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Rubrica dei clienti del locale. Nasce per il domicilio: l'indirizzo di chi
// ordina la cena e' sempre lo stesso, e farlo ridettare ogni volta al telefono
// e' il momento in cui si sbaglia il civico. Vale anche per l'asporto, dove
// basta il nome per riconoscere chi passa a ritirare tutte le settimane.
//
// Non e' un account: il cliente non entra da nessuna parte e non ha una
// password. E' l'agenda di carta accanto al telefono, scritta una volta sola.
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    // Il telefono ridotto alle sole cifre. E' la chiave con cui si riconosce
    // chi ha gia' ordinato: la stessa persona lo detta ogni volta in un modo
    // diverso ("+39 333...", "333 123 45 67"), e confrontare le stringhe cosi'
    // come sono creerebbe tre schede per lo stesso cliente.
    phoneKey: text("phone_key"),
    email: text("email"),
    // L'indirizzo sta a pezzi come alla cassa: il civico e' la cosa che si
    // perde piu' facilmente, ed e' quella senza cui il fattorino gira a vuoto.
    street: text("street"),
    streetNumber: text("street_number"),
    // Seconda riga: CAP e comune.
    area: text("area"),
    // La riga intera, gia' composta. Si salva invece di ricomporla ogni volta
    // perche' e' quella che finisce stampata sulla comanda e cercata a mano.
    address: text("address"),
    // Il citofono rotto, il cane, "suonare al secondo piano". Chi consegna lo
    // legge sulla comanda, e non ha modo di saperlo altrimenti.
    notes: text("notes"),
    ordersCount: integer("orders_count").notNull().default(0),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Un numero, un cliente. I NULL in Postgres non si scontrano fra loro:
    // le schede senza telefono restano tutte valide, ed e' giusto cosi' —
    // due "Marco" senza recapito possono benissimo essere due persone.
    unique().on(table.tenantId, table.phoneKey),
    index("customers_tenant_name_idx").on(table.tenantId, table.name),
  ]
);


// Segnalazioni dello staff: "questo non funziona", "questo e' scomodo",
// "si potrebbe fare cosi'". Nascono in fondo alla barra della dashboard, dove
// c'e' la firma di chi mantiene il software.
//
// Restano qui e non solo nella notifica che mi arriva: un avviso si perde, si
// legge di corsa, arriva mentre guido. La riga in tabella e' quella che tiene
// aperto il conto finche' qualcuno non risponde.
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Se l'account di chi ha segnalato viene cancellato, la segnalazione
    // resta: il problema che raccontava non se ne va insieme a lui.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // L'indirizzo copiato al momento dell'invio, per sapere con chi si stava
    // parlando anche quando l'utente non c'e' piu'.
    userEmail: text("user_email").notNull(),
    // blocco | fastidio | idea. Tre bottoni e non una scala da 1 a 5: durante
    // il servizio nessuno si ferma a scegliere la gravita' giusta.
    kind: text("kind").notNull().default("fastidio"),
    message: text("message").notNull(),
    // Contesto raccolto da solo. Chiedere "in che pagina eri?" vuol dire
    // scoprirlo tre messaggi dopo, quando chi segnala e' tornato al lavoro.
    page: text("page"),
    userAgent: text("user_agent"),
    // aperta | presa | risolta
    status: text("status").notNull().default("aperta"),
    reply: text("reply"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    // Quando chi ha segnalato ha letto la risposta. Finche' e' nullo, la
    // dashboard tiene acceso il pallino.
    replySeenAt: timestamp("reply_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // La dashboard legge le ultime di un locale, l'admin le apre tutte per
    // stato: sono le due letture che esistono.
    index("support_tickets_tenant_idx").on(table.tenantId, table.createdAt),
    index("support_tickets_status_idx").on(table.status),
  ]
);

// Il contratto di un locale: una riga sola, che dice cosa paga e quando.
//
// Il prezzo sta qui e non nel listino di lib/billing/listino.ts perche' e' un
// patto gia' fatto: il listino cambia, quello che il locale ha accettato no.
// Vale anche per i primi venti, che hanno un prezzo bloccato a vita e che
// nessun ritocco al listino deve poter toccare per sbaglio.
export const tenantBilling = pgTable("tenant_billing", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),

  // "abbonamento": canone e basta, si rinnova finche' non disdice.
  // "impianto": attivazione pagata una volta all'inizio, poi assistenza.
  model: text("model").notNull().default("abbonamento"),
  // sala | locale | tutto | su_misura
  pack: text("pack").notNull().default("sala"),
  // mensile | annuale. Sull'impianto l'assistenza e' sempre mensile.
  period: text("period").notNull().default("mensile"),

  // Quanto si paga a ogni scadenza, gia' scelto fra mese e anno: chi legge
  // questa riga non deve rifare il conto per sapere cosa addebitare.
  recurringCents: integer("recurring_cents").notNull().default(0),
  // Attivazione una tantum: si fattura alla firma e poi non si tocca piu'.
  activationCents: integer("activation_cents").notNull().default(0),
  activationInvoicedAt: timestamp("activation_invoiced_at", { withTimezone: true }),

  // Il pacchetto che entrera' in vigore al prossimo rinnovo. Serve al
  // downgrade: chi scende non scende oggi — ha gia' pagato fino a fine
  // periodo, e togliergli i moduli prima sarebbe togliergli roba pagata.
  // L'upgrade invece non passa di qui: parte subito.
  pendingPack: text("pending_pack"),
  pendingFrom: timestamp("pending_from", { withTimezone: true }),

  // Conguaglio da mettere sulla prossima fattura, in centesimi. Nasce
  // dall'upgrade a meta' periodo: il piano nuovo parte oggi, ma i giorni gia'
  // pagati al prezzo vecchio non si buttano — si addebita la differenza per i
  // giorni che restano. Si azzera appena e' finito in fattura.
  adjustmentCents: integer("adjustment_cents").notNull().default(0),
  adjustmentNote: text("adjustment_note"),
  // Quota piattaforma sul transato, in punti base (40 = 0,40%).
  transactionBps: integer("transaction_bps").notNull().default(0),

  // prova | attivo | sospeso | chiuso. "sospeso" e' il non pagante: il locale
  // resta, i dati restano, la dashboard no. Diverso da tenants.suspended, che
  // e' la mano dell'admin — qui e' il conto che non torna.
  status: text("status").notNull().default("prova"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  // La prossima scadenza da fatturare. E' il campo che fa girare tutto:
  // "chi va fatturato oggi" e' una sola riga di query su questa colonna.
  nextInvoiceAt: timestamp("next_invoice_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),

  // stripe | paypal | manuale. Con "manuale" si segna a mano l'incasso.
  provider: text("provider").notNull().default("manuale"),
  // Gli identificativi di la': il cliente e l'abbonamento aperti da Stripe o
  // da PayPal. Restano nulli finche' il locale non mette un metodo.
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  // Il locale ha disdetto, e l'abbonamento morira' questo giorno.
  //
  // Una disdetta non e' immediata: vale a fine periodo, perche' quel periodo
  // l'ha gia' pagato. Serve una colonna perche' fra il giorno in cui disdice e
  // il giorno in cui se ne va puo' passare un anno, e in mezzo il pannello
  // deve dire che se ne sta andando — e' l'unica finestra in cui lo si puo'
  // ancora richiamare. Senza, lo si scoprirebbe l'ultimo giorno.
  //
  // Null vuol dire che l'abbonamento non ha una fine programmata: o non c'e',
  // o va avanti.
  providerCancelAt: timestamp("provider_cancel_at", { withTimezone: true }),

  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// I documenti emessi al locale.
//
// Emittente e destinatario sono copiati dentro, non letti per riferimento:
// una fattura racconta com'erano le cose il giorno in cui e' stata emessa, e
// se il locale cambia ragione sociale a settembre quelle di marzo devono
// restare come sono. Stessa regola dei prezzi negli ordini.
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),

    // Numerazione per anno, senza buchi: 2026/1, 2026/2. Il numero si assegna
    // all'emissione, mai alla bozza — una bozza cancellata non deve lasciare
    // un vuoto in mezzo alla serie.
    year: integer("year").notNull(),
    number: integer("number"),
    // proforma | fattura | nota_credito
    kind: text("kind").notNull().default("fattura"),

    // bozza | emesso | pagato | scaduto | annullato
    status: text("status").notNull().default("bozza"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // Il periodo che il documento copre: "marzo", "dal 1 al 31". Serve al
    // locale per capire cosa sta pagando piu' del numero progressivo.
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    vatRateBps: integer("vat_rate_bps").notNull().default(0),
    vatCents: integer("vat_cents").notNull().default(0),
    // Marca da bollo: due euro sopra i 77,47 quando l'IVA non c'e'. Sta a
    // parte perche' non e' imponibile e non e' imposta, e sommarla dentro uno
    // dei due farebbe tornare i conti sbagliati al commercialista.
    stampCents: integer("stamp_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    // Emittente e destinatario congelati al momento dell'emissione.
    sellerSnapshot: jsonb("seller_snapshot"),
    buyerSnapshot: jsonb("buyer_snapshot"),
    // La riga di legge sotto il totale: il regime forfettario ne pretende
    // una, e cambia se cambia il regime.
    vatNote: text("vat_note"),

    // Lo Sistema di Interscambio arrivera' dopo, quando il provider sara'
    // scelto. Le colonne ci sono da subito perche' aggiungerle a fatture gia'
    // emesse vuol dire non sapere piu' quali erano partite davvero.
    // da_inviare | inviata | consegnata | scartata
    sdiStatus: text("sdi_status"),
    sdiId: text("sdi_id"),
    sdiSentAt: timestamp("sdi_sent_at", { withTimezone: true }),
    sdiError: text("sdi_error"),

    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Due sole letture: i documenti di un locale, e quelli da incassare.
    index("invoices_tenant_idx").on(table.tenantId, table.createdAt),
    index("invoices_status_idx").on(table.status, table.dueAt),
    // Il progressivo e' unico dentro l'anno. Le bozze hanno numero nullo e
    // Postgres non le conta: e' esattamente quello che serve.
    unique("invoices_numero_anno").on(table.year, table.number),
  ]
);

export const invoiceLines = pgTable(
  "invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    // canone | attivazione | modulo | consumo | commissione | sconto
    kind: text("kind").notNull().default("canone"),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitCents: integer("unit_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (table) => [index("invoice_lines_invoice_idx").on(table.invoiceId, table.position)]
);

// Gli incassi. Una fattura puo' averne piu' di uno — l'acconto e il saldo di
// un impianto — quindi non basta una data sul documento.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    // Un incasso senza documento esiste: l'acconto arrivato prima che la
    // fattura fosse pronta. Si aggancia dopo.
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    amountCents: integer("amount_cents").notNull(),
    // stripe | paypal | bonifico | contanti | altro
    method: text("method").notNull().default("bonifico"),
    // L'identificativo di la': il PaymentIntent di Stripe, l'ordine PayPal.
    // Unico, cosi' lo stesso avviso ricevuto due volte non incassa due volte.
    providerRef: text("provider_ref"),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payments_tenant_idx").on(table.tenantId, table.paidAt),
    unique("payments_provider_ref").on(table.providerRef),
  ]
);

// Le impostazioni commerciali della piattaforma: una riga sola.
//
// Stanno a database e non nell'ambiente — al contrario dei dati fiscali in
// FATTURAZIONE_* — perche' sono decisioni che si cambiano provando: la durata
// della prova la si allunga perche' i pilota ci mettono di piu', la tolleranza
// sui pagamenti la si accorcia dopo il primo che sparisce. Roba da pannello,
// non da riavvio del server.
export const billingSettings = pgTable("billing_settings", {
  // Chiave fissa: la riga e' una e deve restare una.
  id: text("id").primaryKey().default("unico"),

  // Quanto dura la prova di un locale nuovo, in giorni.
  trialDays: integer("trial_days").notNull().default(30),
  // Quota sul transato proposta ai contratti nuovi, in punti base.
  transactionBps: integer("transaction_bps").notNull().default(40),
  // Giorni di tolleranza dopo la scadenza di una fattura prima di spegnere il
  // servizio. Zero vorrebbe dire chiudere il rubinetto la mattina dopo, che
  // con un locale che paga da due anni non si fa.
  graceDays: integer("grace_days").notNull().default(10),
  // Il blocco automatico si puo' spegnere del tutto: nei primi mesi conviene
  // guardare in faccia chi non paga invece di lasciar decidere a un job.
  autoSuspend: boolean("auto_suspend").notNull().default(false),
  // Anche la prova scaduta blocca, o resta aperta finche' non decido io.
  suspendExpiredTrials: boolean("suspend_expired_trials").notNull().default(true),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Il listino modificabile dal pannello. Le righe che mancano ricadono sul
// catalogo in lib/billing/listino.ts: stessa regola dei moduli, cosi' un
// pacchetto aggiunto nel codice funziona subito senza doverlo prima
// prezzare a mano.
export const billingPrices = pgTable(
  "billing_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullo = prezzo di listino, vale per tutti. Valorizzato = prezzo di
    // quel locale, e vince sul listino. Tre livelli in tutto — codice,
    // listino, cliente — risolti sempre nello stesso ordine da
    // lib/billing/prezzi.ts: se la risoluzione si sparpaglia, fra sei mesi
    // non si sa piu quale prezzo vince.
    tenantId: uuid("tenant_id").references(() => tenants.id, {
      onDelete: "cascade",
    }),
    // pacco | modulo
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    // Sui moduli conta solo `mensileCents`: un singolo add-on non ha un
    // prezzo di impianto ne' un annuale suo.
    mensileCents: integer("mensile_cents").notNull().default(0),
    annualeCents: integer("annuale_cents").notNull().default(0),
    attivazioneCents: integer("attivazione_cents").notNull().default(0),
    assistenzaCents: integer("assistenza_cents").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("billing_prices_scope_key").on(table.scope, table.key, table.tenantId),
    // Il vincolo qui sopra non basta: per Postgres due NULL sono diversi, e
    // due righe di listino globale per lo stesso pacchetto passerebbero
    // entrambe. Questo indice tiene unica la riga senza tenant.
    uniqueIndex("billing_prices_globali")
      .on(table.scope, table.key)
      .where(sql`tenant_id is null`),
  ]
);

// Gli add-on di un locale: i moduli che paga a parte, fuori dal pacchetto.
// Il prezzo sta qui e non nel listino perche' e' quello concordato con lui —
// il listino dice 79, a questo l'ho fatto a 59 e deve restare 59.
export const tenantAddons = pgTable(
  "tenant_addons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    priceCents: integer("price_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("tenant_addons_tenant_module").on(table.tenantId, table.moduleKey)]
);

// I documenti che carico io per un locale: il contratto firmato, un preventivo,
// la visura, la copia di un bonifico.
//
// Il file NON sta sotto public/: un contratto firmato con dentro la partita
// IVA e la firma del titolare non deve essere scaricabile da chiunque indovini
// l'indirizzo. Sta in una cartella fuori dal servito, e si passa da una rotta
// che prima guarda chi sta chiedendo.
export const tenantFiles = pgTable(
  "tenant_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // contratto | preventivo | documento | altro
    kind: text("kind").notNull().default("documento"),
    // Come lo chiamo io nell'elenco. Il nome del file caricato spesso e'
    // "scan_0012.pdf" e fra sei mesi non dice piu' niente a nessuno.
    title: text("title").notNull(),
    // Il nome originale, per ridarglielo uguale quando lo si scarica.
    fileName: text("file_name").notNull(),
    // Il nome su disco: casuale, cosi' due "contratto.pdf" non si pestano i
    // piedi e nessuno indovina un percorso.
    storedName: text("stored_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    // Se il locale lo vede dalla sua dashboard. Il contratto si': e' suo, e
    // farglielo chiedere per mail ogni volta e' lavoro per tutti e due. Gli
    // appunti miei no.
    visibleToTenant: boolean("visible_to_tenant").notNull().default(true),
    notes: text("notes"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("tenant_files_tenant_idx").on(table.tenantId, table.uploadedAt)]
);

// Il pacchetto su misura di un locale: uno per locale, disegnato in
// trattativa.
//
// Non sta in `billing_prices` con gli altri scostamenti perche' non e' un
// prezzo: e' una composizione. Quali moduli comprende lo decido io caso per
// caso, ed e' proprio la cosa che i tre pacchetti standard non sanno dire.
//
// Una volta creato compare accanto a Base, Pro e Premium nella pagina dove il
// locale sceglie, e ci resta: se passa a Pro e poi ci ripensa, il suo su
// misura e' ancora li'. Cancellarlo appena non e' quello scelto vorrebbe dire
// costringerlo a richiamarmi per tornare indietro.
export const tenantCustomPacks = pgTable("tenant_custom_packs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .unique()
    .references(() => tenants.id, { onDelete: "cascade" }),
  // Come si chiama per lui: "Il tuo piano", "Pro senza asporto", quello che
  // gli ho detto al telefono. Il nome fa parte dell'accordo.
  label: text("label").notNull().default("Su misura"),
  descrizione: text("descrizione"),
  // Le chiavi dei moduli compresi nel canone. Array e non tabella a parte:
  // e' una lista corta che si legge e si riscrive sempre tutta insieme.
  moduli: jsonb("moduli").notNull().default([]),
  mensileCents: integer("mensile_cents").notNull().default(0),
  annualeCents: integer("annuale_cents").notNull().default(0),
  attivazioneCents: integer("attivazione_cents").notNull().default(0),
  assistenzaCents: integer("assistenza_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
