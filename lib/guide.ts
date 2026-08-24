import type { ModuleState } from "@/lib/modules";

// Il testo del "Come funziona" della dashboard, una guida per scheda.
//
// Sta qui e non dentro al componente per una ragione sola: e' roba che si
// riscrive spesso — cambia un pulsante, cambia il passo che lo racconta — e
// nessuno deve mettere mano al foglio che la mostra per correggere una frase.
//
// I passi si costruiscono sui moduli attivi e sul ruolo di chi guarda: a chi
// non ha le prenotazioni non si spiega come confermarle, e allo staff non si
// racconta la pagina delle fatture che non puo' nemmeno aprire.

export type PassoGuida = {
  titolo: string;
  testo: string;
  punti?: string[];
};

export type Guida = {
  // Compare in cima al foglio: la guida si apre sopra la pagina e la copre,
  // quindi deve dire di che scheda sta parlando.
  titolo: string;
  passi: PassoGuida[];
};

export type ContestoGuida = {
  modules: ModuleState;
  isOwner: boolean;
};

// Da /dashboard/cameriere/12 alla scheda "cameriere": le pagine figlie
// raccontano la stessa cosa della voce di menu che le tiene accese.
export function chiaveTab(path: string): string {
  const resto = path.replace(/^\/dashboard\/?/, "");
  return resto.split("/")[0] || "home";
}

export function guidaDelTab(
  chiave: string,
  { modules, isOwner }: ContestoGuida
): Guida | null {
  switch (chiave) {
    case "home":
      return {
        titolo: "Panoramica",
        passi: [
          {
            titolo: "I numeri in cima sono di oggi",
            testo:
              "Dalla mezzanotte a adesso: quanti ordini stanno aspettando, quanti tavoli hai aperti, quanti ordini sono passati e quanto e' entrato. Se il primo riquadro e' colorato, in coda c'e' qualcuno che aspetta.",
            punti: [
              "«Incasso oggi» conta solo quello che e' gia' stato incassato: quello fermo sui tavoli aperti non c'e' ancora.",
              ...(modules.reservations
                ? [
                    "«Coperti prenotati» sono le persone attese oggi, senza le prenotazioni annullate.",
                  ]
                : []),
              "Questa pagina non si aggiorna da sola: per rifare i conti ricaricala. La coda ordini invece si', ed e' quella da tenere aperta durante il servizio.",
            ],
          },
          {
            titolo: "Da qui si va al lavoro",
            testo:
              "I riquadri sotto «Gestione» sono le scorciatoie ai posti dove si passa la serata. Tutto il resto sta nella colonna di sinistra; da telefono si apre col pulsante in alto a sinistra.",
          },
          ...(isOwner
            ? [
                {
                  titolo: "Cosa manca per partire",
                  testo:
                    "Finche' il locale non e' pronto, in cima trovi l'elenco di cosa manca coi numeri veri: categorie, prodotti, tavoli, orari. Non e' da leggere, e' da spuntare — e sparisce da sola quando i passi necessari sono fatti, quindi non c'e' niente da chiudere.",
                },
              ]
            : []),
          {
            titolo: "Se qualcosa non torna",
            testo:
              "In fondo al menu di sinistra c'e' «Segnala un problema»: scrivi cosa stavi facendo quando e' successo. La risposta ti torna li' dentro, senza telefonate.",
          },
        ],
      };

    case "orders":
      return {
        titolo: "Coda ordini",
        passi: [
          {
            titolo: "Si smaltisce dall'alto",
            testo:
              "In cima c'e' chi aspetta da piu' tempo. A destra ci sono i minuti di attesa, e quando il filetto laterale diventa giallo o rosso quel tavolo sta aspettando troppo. Le soglie cambiano da canale a canale: venti minuti a domicilio sono normali, a un tavolo sono un disastro.",
            punti: [
              "Gli ordini nuovi compaiono da soli, senza ricaricare la pagina.",
              "Dove c'e' un orario concordato non contano i minuti di attesa ma quanto manca: «fra 20 min», «in ritardo di 5 min».",
            ],
          },
          {
            titolo: "Due tocchi per ordine",
            testo:
              "«Inizia a preparare» quando lo prendi in mano, «Segna come servito» quando esce. Non e' burocrazia: il cliente vede lo stesso stato sul telefono, e smette di chiedere a che punto e'.",
          },
          {
            titolo: "Il riquadro giallo si legge",
            testo:
              "E' quello che ha scritto il cliente: «senza ghiaccio», «ben cotta». Sui prodotti su richiesta li' dentro c'e' tutto l'ordine, e sotto trovi «cambia prezzo» per sistemarlo se quello che stai versando costa diverso — il prezzo corretto lo vede anche il cliente sul suo conto.",
            punti: [
              "Il numero di calici sta accanto al nome del prodotto: portare la bottiglia senza vuol dire tornare indietro.",
            ],
          },
          {
            titolo: "Se un prodotto e' finito",
            testo:
              "Tocca «modifica» in alto nella scheda, poi «annulla» sulla riga. Esce dal conto e il cliente se lo ritrova barrato sul telefono, quindi lo sa prima di pagare. «ripristina» lo rimette. Finito, tocca «fine»: le crocette sempre a schermo si toccano per sbaglio proprio mentre si corre.",
          },
          ...(modules.web_orders && (modules.takeaway || modules.delivery)
            ? [
                {
                  titolo: "Gli ordini dal sito si accettano",
                  testo:
                    "Quelli arrivati dal sito stanno in cima, sotto «Da accettare», e finche' non li accetti non e' partita nessuna comanda: nessuno ha cominciato a preparare niente. Accettandoli entrano in coda come tutti gli altri e la comanda parte in quel momento.",
                  punti: [
                    "L'ora concordata si cambia prima di accettare: batti quella giusta nel campo — «va bene per le nove e un quarto» si scrive e basta — oppure usa «+15» e «+30», che sono la stessa cosa in un tocco. Il tasto di conferma dice l'ora con cui stai accettando, e il cliente la vede sulla sua pagina.",
                    "A domicilio il costo di consegna si corregge li': accanto all'indirizzo c'e' la distanza da cui e' uscito, e dove la linea d'aria mente — un fiume, una tangenziale — il numero giusto lo sai tu.",
                    "I prezzi si correggono riga per riga prima di accettare, come al tavolo: «cambia prezzo» sotto la voce. Serve per l'ingrediente in piu' concordato al telefono e per lo sconto fatto a voce — dopo, quel numero se lo ritrova il cliente in cassa.",
                    "Le note che il cliente ha scritto sulle righe («senza cipolla», «poco ghiaccio») stanno sotto il nome del prodotto: leggetele prima di accettare, sono la cosa che poi finisce sulla comanda.",
                    "«Rifiuta» chiude l'ordine senza preparare niente. Il cliente lo legge sulla sua pagina, ma se puoi chiamalo: il suo numero e' li' accanto al nome.",
                    "Quando arriva un ordine dal sito la pagina suona, con lo stesso suono delle chiamate dal tavolo.",
                  ],
                },
                {
                  titolo: "Dire al cliente a che punto e'",
                  testo:
                    "In fondo alla scheda di un ordine dal sito ci sono i tasti in fila: «Inizia a preparare», «È pronto», «È partito» a domicilio, poi «Ritirato» o «Consegnato». Ogni tocco si accende sulla pagina del cliente nel giro di qualche secondo, e se hai acceso gli aggiornamenti gli parte anche la mail. Sono i tocchi che vi risparmiano le telefonate del «e' pronto?».",
                  punti: [
                    "«È pronto» e' quello che conta davvero: da li' il cliente sa che puo' passare, e non arriva un quarto d'ora prima a guardarvi lavorare.",
                    "«non era pronto» torna indietro. Capita di premere per sbaglio, e non e' il caso di far scendere qualcuno in strada per niente.",
                    "Se non tocchi niente non si rompe nulla: il cliente vede «confermato» finche' l'ordine non si chiude. Questi tasti servono a lui, non alla cucina, che ha le sue righe da spuntare come sempre.",
                  ],
                },
                {
                  titolo: "Le pillole e il rubinetto",
                  testo:
                    "Le pillole in alto filtrano per canale: chi impacchetta gli asporti non deve scorrere i tavoli. E «Sospendi per stasera» chiude il rubinetto degli ordini dal sito quando la cucina e' al completo: la pagina resta in piedi e dice ai clienti di chiamare. Si riapre da sola a mezzanotte.",
                },
              ]
            : []),
        ],
      };

    case "sala":
      return {
        titolo: "Sala",
        passi: [
          {
            titolo: "Un riquadro per tavolo",
            testo:
              "Quelli occupati dicono da quanto sono seduti, in quanti e quanto hanno fatto finora. Il pallino diventa giallo dopo due ore: non e' un allarme, e' il tavolo da cui passare.",
            punti: [
              "Il tempo parte dal primo segnale che c'e' di quel tavolo: il QR scansionato, la prima ordinazione, o il momento in cui l'hai aperto tu.",
              "Le persone sono quelle che hanno dichiarato ordinando. Finche' nessuno lo dice valgono i posti dei tavoli — due accostati da due e da quattro fanno sei — e si correggono selezionando il tavolo.",
              "«Ha scansionato il QR» vuol dire che qualcuno si e' seduto e sta leggendo il menu: e' un'informazione piu' debole di un conto aperto, e la pagina te lo dice invece di far finta di niente.",
            ],
          },
          {
            titolo: "Due tavoli accostati sono un tavolo solo",
            testo:
              "Tocca il primo, tocca il secondo, «Unisci i tavoli». Da quel momento risultano occupati tutti e due e quello che si ordina dai loro QR finisce su un conto unico, intestato al tavolo piu' basso dei due.",
            punti: [
              "«Separa» li stacca di nuovo. Quello che era gia' stato ordinato resta sul conto dove sta: le comande sono partite, e nessuno sa piu' chi ha mangiato da che parte del tavolo lungo.",
              "Un tavolo dove qualcuno ha gia' pagato non si unisce: prima si chiude quel conto.",
              ...(modules.reservations
                ? [
                    "Le prenotazioni su piu' tavoli si uniscono da sole quando segni «Arrivati».",
                  ]
                : []),
            ],
          },
          {
            titolo: "Il conto sul tavolo sbagliato si sposta",
            testo:
              "Tocca il tavolo dove sta il conto, poi quello (o quelli) dove deve andare, e premi «Sposta il conto». Serve piu' spesso a correggere che a spostare: l'ordine battuto sul 5 invece che sul 6 prima si rimediava solo annullando le righe, che restano barrate sul conto per sempre.",
            punti: [
              "Si porta dietro tutto: consumazioni, quello che qualcuno ha gia' pagato, le chiamate in attesa. E l'ora resta quella in cui si sono seduti davvero.",
              "I telefoni rimasti al tavolo di prima devono riscansionare il QR: cosi' nessuno continua a ordinare su un conto che adesso e' da un'altra parte.",
              "Il tavolo d'arrivo dev'essere libero. Se e' occupato non e' uno spostamento ma una fusione di due conti, e quella si fa con «Unisci».",
            ],
          },
          {
            titolo: "Segna occupato chi non ha ancora ordinato",
            testo:
              "Si siedono, guardano il menu, e per il sistema quel tavolo e' libero. Toccalo e premi «Segna occupato»: da li' parte il tempo, e puoi dire anche in quanti sono. «Libera» lo rimette a posto se se ne vanno senza consumare — se invece c'e' da incassare, il tavolo si chiude dai conti aperti.",
          },
          ...(modules.reservations
            ? [
                {
                  titolo: "Chi arriva dopo",
                  testo:
                    "In fondo al riquadro compare la prossima prenotazione su quel tavolo, con l'ora e il nome. Vale anche sui tavoli occupati: e' li' che serve, perche' dice entro quando va liberato.",
                },
              ]
            : []),
        ],
      };

    case "cameriere":
      return {
        titolo: "Ordine dal cameriere",
        passi: [
          {
            titolo: "Prima il tavolo",
            testo:
              "Tocca il numero. I tavoli colorati hanno gia' un conto aperto: toccandoli ci aggiungi sopra, non apri un secondo conto. Da dentro, «Cambia tavolo» in alto riporta qui.",
          },
          {
            titolo: "Poi e' il menu del cliente",
            testo:
              "La schermata che si apre e' esattamente quella che vede chi ordina dal QR: stessa ricerca, stessi prodotti, stesse note. Cerchi per nome o per ingrediente, tocchi, e la voce va nel carrello.",
          },
          ...(modules.split_bill
            ? [
                {
                  titolo: "Intesta quello che ti dicono",
                  testo:
                    "Chi e' gia' seduto compare come pulsante: lo tocchi e quello che aggiungi finisce sul suo conto. Un nome nuovo si scrive una volta sola. «Condiviso» e' per la bottiglia del tavolo, e sotto si sceglie fra chi si divide.",
                },
              ]
            : []),
          {
            titolo: "Finisce nella stessa coda",
            testo:
              "Premuto «Invia ordine», la comanda arriva al banco come quelle dal QR e si stampa allo stesso modo. Da li' in poi si corregge dalla coda ordini o dai conti aperti, non piu' da questa pagina.",
          },
        ],
      };

    case "banco":
      return {
        titolo: "Cassa al banco",
        passi: [
          {
            titolo: "Un tocco per prodotto",
            testo:
              "Scegli la categoria o scrivi nella ricerca, poi tocca il riquadro: il prodotto entra nel conto di fianco, e ritoccandolo sale la quantita'. I prodotti con piu' formati hanno un riquadro per formato, col prezzo giusto gia' scritto.",
            punti: [
              "«★ Preferiti» sono i prodotti che segni dalla scheda Menu: quelli che al banco si battono cento volte a sera.",
              "Nel conto, «−» e «+» correggono le quantita' e «svuota» ricomincia da capo.",
            ],
          },
          {
            titolo: "Le note valgono anche qui",
            testo:
              "«+ nota» sulla riga per «senza ghiaccio» o «ben cotta». Sui prodotti su richiesta la nota non e' facoltativa: e' li' che si scrive cosa vuole, o chi prepara non sa cosa versare.",
          },
          ...(modules.takeaway || modules.delivery
            ? [
                {
                  titolo: "Banco, asporto, domicilio",
                  testo:
                    "Le linguette in alto cambiano il tipo di ordine. Al banco si incassa subito e il conto si chiude li'; asporto e domicilio restano fra i conti aperti finche' non passano a ritirare. Per quelli servono il nome, il telefono e l'ora concordata: senza orario la cucina parte subito e il cliente ritira freddo.",
                  punti: modules.delivery
                    ? [
                        "A domicilio si aggiungono l'indirizzo e il costo di consegna, che finisce nel totale.",
                      ]
                    : undefined,
                },
              ]
            : []),
          ...(modules.customers
            ? [
                {
                  titolo: "La rubrica ti scrive l'ordine",
                  testo:
                    "Scrivendo il nome compaiono i clienti gia' salvati: scegli e telefono e indirizzo si compilano da soli, con la nota di consegna che nessuno si ricorda («citofono rotto», «secondo piano»). «Salva in rubrica» resta acceso, cosi' la rubrica si riempie mentre lavori.",
                },
              ]
            : []),
          {
            titolo: "Prima di incassare, le spunte",
            testo:
              "«Stampa comanda» e «Stampa scontrino» partono da come sono messe le impostazioni, ma qui si cambiano ordine per ordine: davanti hai il cliente, non un pannello. Poi il pulsante grande in fondo chiude il giro.",
          },
        ],
      };

    case "bill":
      return {
        titolo: "Conti aperti",
        passi: [
          {
            titolo: "Un riquadro per conto",
            testo:
              "In alto a destra c'e' quanto resta da incassare, e la barra dice quanto e' gia' entrato. L'etichetta «Ordine in corso» vuol dire che al banco stanno ancora preparando qualcosa di quel tavolo.",
          },
          {
            titolo: "Si incassa una persona alla volta",
            testo:
              "Ogni nome ha il suo totale e il suo pulsante «Incassa». Toccandolo quelle righe diventano «Pagato» e non si toccano piu'. I riquadri grigi sono le cose divise: la quota di ognuno e' gia' dentro al suo totale, non si incassano a parte.",
          },
          {
            titolo: "Persone al tavolo e coperto",
            testo:
              "Il «−» e il «+» accanto a «Persone al tavolo» correggono quanti sono davvero: da quel numero si rifanno le quote del condiviso e il coperto. Se il cliente si e' contato male, si sistema qui prima di incassare.",
          },
          {
            titolo: "Le pillole in alto",
            testo:
              "Filtrano per provenienza, come in coda ordini: sala, banco, asporto, domicilio. Chi impacchetta gli asporti non deve scorrere i tavoli. Compaiono da due canali in su.",
          },
          {
            titolo: "Correggere: annulla, sposta, nota",
            testo:
              "Tocca «modifica». «annulla» toglie dal totale quello che non e' stato servito e lo lascia barrato, cosi' si sa sempre perche' il conto e' quello. «sposta» riporta una voce su chi la paga davvero: una persona sola, o divisa fra piu' nomi toccandone piu' di uno. Se le copie sono tante se ne sposta anche solo una parte. «nota» riscrive quello che c'e' scritto sulla riga.",
            punti: [
              "Una riga gia' incassata non si tocca piu', ne' qui ne' altrove.",
              "Spostare cambia solo chi paga: la comanda andata in cucina resta com'era, perche' quello e' stato ordinato davvero.",
              "La nota corretta adesso non ristampa niente: la comanda con quella vecchia e' gia' in cucina, e una seconda uguale farebbe rifare il piatto. Si vede in coda, e se la carta e' gia' uscita ditelo a voce.",
            ],
          },
          {
            titolo: "«Mi aggiungete due birre»",
            testo:
              "Dentro «modifica» c'e' «+ Aggiungi al conto»: si cerca il piatto per nome, si sceglie la quantita' e si scrive la nota. Finisce su questo conto, non su uno nuovo — al ritiro si incassa una volta sola.",
            punti: [
              "Al tavolo nasce un ordine nuovo sullo stesso tavolo, che entra in coda con l'ora di adesso. Fuori dalla sala le righe si attaccano all'ordine che c'e' gia': l'orario concordato e l'indirizzo restano quelli.",
              "In cucina parte una comanda con solo le righe nuove, marcata «AGGIUNTA»: ristampare tutto vorrebbe dire far rifare da capo quello che stavano gia' preparando.",
              "Un ordine dal sito ancora da accettare non si tocca da qui: prima accettalo in coda, che e' il posto dove parte anche la comanda.",
            ],
          },
          {
            titolo: "Chiudere il tavolo",
            testo:
              "«Stampa il conto» quando lo chiedono — lo scontrino fiscale lo emette la vostra cassa, non noi. «Chiudi tavolo» quando e' tutto saldato; se manca ancora qualcosa il pulsante diventa «Chiudi e salda il resto», e quello che resta viene dato per incassato.",
            punti: [
              "Chiuso il tavolo, i telefoni ancora collegati devono inquadrare di nuovo il QR: il conto e' un altro.",
            ],
          },
        ],
      };

    case "prenotazioni":
      return {
        titolo: "Prenotazioni",
        passi: [
          {
            titolo: "Stai guardando un giorno",
            testo:
              "Le frecce in alto a destra cambiano giornata, e i quattro numeri sono di quel giorno soltanto. Se «Da confermare» e' acceso, c'e' qualcuno che aspetta una risposta da voi.",
          },
          {
            titolo: "Cosa si fa su ogni riga",
            testo:
              "«Conferma» risponde di si' e avvisa il cliente. «Sono arrivati» quando si siedono, «Non presentati» quando l'ora e' passata a vuoto, «Annulla» quando disdicono. Accanto al nome c'e' sempre scritto dove li mettete.",
            punti: [
              "Se al loro tavolo c'e' ancora gente, «Sono arrivati» non li fa sedere: te lo dice, e ti da' le due strade vere — dargliene un altro, oppure farli aspettare che quel conto venga chiuso dalla cassa. Sedersi su un tavolo occupato vorrebbe dire due tavolate su un conto solo, e ce ne si accorge alla cassa.",
            ],
          },
          {
            titolo: "I tavoli si scelgono a mano, anche piu' d'uno",
            testo:
              "«Cambia i tavoli» apre la sala: tocchi i numeri che vuoi dare a quel gruppo e sotto vedi salire i posti — «14 posti per 18 persone» finche' non bastano, verde quando ci stanno. L'assegnazione automatica accosta quello che trova, ma la comitiva sulla stessa fila la decide chi la sala ce l'ha davanti.",
            punti: [
              "Il pallino giallo vuol dire che quel tavolo e' gia' di qualcuno: c'e' gente seduta adesso, oppure lo tiene un'altra prenotazione in quella fascia — sotto c'e' scritto quale delle due. Puoi darglielo lo stesso, ma chi c'e' non si sposta da solo.",
              "Ci sono anche i tavoli non prenotabili dal web: il bancone non si da' a chi prenota da solo, ma per una comitiva lo si usa.",
              "Togliendoli tutti la prenotazione resta senza posto: si puo' fare, in sala sapete voi dove metterli.",
              "Se il gruppo si e' gia' seduto, la Sala segue: il tavolo aggiunto risulta occupato, quello tolto torna libero, e il tempo di quelli che erano gia' li' non riparte da capo. L'unico che non si stacca e' il tavolo dove sta il conto, o si spezzerebbe in due il conto di gente che paga insieme.",
            ],
          },
          {
            titolo: "Spostare invece di rifiutare",
            testo:
              "Quasi sempre il tavolo c'e', ma mezz'ora dopo. «Sposta a un altro orario» blocca subito il posto nuovo e manda la proposta per mail: la prenotazione resta in attesa finche' il cliente non accetta.",
          },
          {
            titolo: "Prenderla al telefono",
            testo:
              "«Prendi una prenotazione al telefono» la mette dentro come se l'avesse fatta il cliente. Il tavolo si assegna da solo se ce n'e' uno libero; se la sala e' piena si salva lo stesso senza posto. Lasciando l'email, al cliente arrivano la conferma e il link per disdire da solo.",
          },
          ...(isOwner
            ? [
                {
                  titolo: "Se il modulo non risponde a nessuno",
                  testo:
                    "Servono due cose: gli orari di apertura in Impostazioni, per sapere in che fasce si prenota, e almeno un tavolo segnato «prenotabile» coi suoi posti, in Tavoli. Durata del tavolo, quante persone si accettano online e conferma automatica stanno in Impostazioni.",
                },
              ]
            : []),
        ],
      };

    case "rubrica":
      return {
        titolo: "Rubrica",
        passi: [
          {
            titolo: "Si riempie da sola",
            testo:
              "Ogni asporto e ogni domicilio battuto in cassa con «Salva in rubrica» acceso lascia qui nome, telefono e indirizzo. Non c'e' un momento in cui si compila la rubrica: si compila lavorando.",
          },
          {
            titolo: "Serve alla cassa, non qui",
            testo:
              "Al banco basta iniziare a scrivere il nome e il cliente compare: scegliendolo, telefono e indirizzo si riempiono da soli e torna a galla la nota di consegna. Il tempo si guadagna li'.",
          },
          {
            titolo: "Cercare, aggiungere, importare",
            testo:
              "La ricerca guarda nome, telefono e indirizzo, e resta nell'indirizzo della pagina: un cliente cercato si puo' ricaricare o tenere aperto. «Aggiungi un cliente» per metterlo a mano, la scheda «Importa» per portare dentro quello che hai gia': un file CSV o le righe incollate.",
          },
        ],
      };

    case "analytics":
      return {
        titolo: "Analytics",
        passi: [
          {
            titolo: "Prima si sceglie il periodo",
            testo:
              "Oggi, 7, 30, 90 giorni, o un intervallo qualsiasi dal calendario. Il periodo e' quello in cui e' stato ordinato, e vive nell'indirizzo della pagina: una serata interessante si manda a qualcuno con un link.",
          },
          {
            titolo: "I quattro numeri in cima",
            testo:
              "Incasso, scontrino medio, ordini, persone servite. Sotto ognuno c'e' il confronto col periodo prima, che e' l'unica cosa che rende leggibile un numero. Lo scontrino medio si calcola a persona seduta e solo sui tavoli gia' chiusi.",
          },
          {
            titolo: "Dove si guarda per decidere",
            testo:
              "«Quando e' pieno» e le fasce orarie dicono dove mettere le persone in turno. «Cosa si vende» e «Per categoria» dicono cosa tenere a menu. «Cosa e' finito» sono le voci annullate: se una torna spesso, conviene ordinarne di piu'.",
          },
          {
            titolo: "Le due tabelle che nessuno guarda",
            testo:
              "«Cosa chiedono i clienti» sono le richieste scritte al tavolo: dicono con parole loro cosa manca a menu. «Fermi a menu» sono i prodotti disponibili che nel periodo non ha ordinato nessuno — non e' una condanna del prodotto, e' la domanda giusta da farsi sul listino.",
          },
        ],
      };

    case "menu":
      return {
        titolo: "Menu",
        passi: [
          {
            titolo: "Una categoria per volta",
            testo:
              "Le linguette in alto sono le categorie, col numero di prodotti dentro. La pagina ne carica una alla volta apposta, per restare leggera anche con centocinquanta prodotti: per cercare in tutto il menu c'e' il campo qui sopra.",
          },
          {
            titolo: "Aggiungere",
            testo:
              "Prima «Nuova categoria», poi «Nuovo prodotto». Nome e prezzo bastano; descrizione, ingredienti e allergeni li legge il cliente sul telefono. «Su richiesta» e' per quello che si fa a voce: il cliente scrive cosa vuole e il prezzo si sistema al banco. «Chiedi i calici» e' per le bottiglie.",
          },
          {
            titolo: "Tutto il resto si fa sulla riga",
            testo:
              "Senza aprire nessuna schermata: i formati col loro prezzo, gli ingredienti (che diventano le scorciatoie «senza gin» che il cliente tocca invece di scrivere), la foto, «★ Preferito» per tenerlo in cima alla cassa al banco. «Modifica» apre nome, prezzo e categoria.",
            punti: [
              "«Segna esaurito» lo lascia a menu ma non ordinabile: e' quello che si tocca a meta' serata, non «Elimina».",
            ],
          },
          ...(modules.web_orders && (modules.takeaway || modules.delivery)
            ? [
                {
                  titolo: "Cosa esce dal locale",
                  testo:
                    "Dentro «Modifica» ci sono «Si porta via» e «Si consegna». Nascono accese — la regola e' che un prodotto si porta a casa — e si spengono per quello che resta qui: il cocktail versato, la birra alla spina, il fritto che a domicilio arriva molle.",
                  punti: [
                    "Sulla riga l'etichetta compare solo quando c'e' un'eccezione: «non in asporto», «non a domicilio», «solo in sala». Un menu dove ogni riga dice «si porta via» non si leggerebbe piu'.",
                  ],
                },
              ]
            : []),
          {
            titolo: "Il coperto sta qui",
            testo:
              "Non nelle impostazioni: e' una voce di listino, e la decide la stessa persona che tocca i prezzi. E' un prezzo fisso a persona che si aggiunge al conto di ognuno. Lasciandolo vuoto non si applica.",
          },
        ],
      };

    case "tables":
      return {
        titolo: modules.qr_ordering ? "Tavoli e QR" : "Tavoli",
        passi: [
          {
            titolo: "Crea la sala",
            testo:
              "Un tavolo alla volta col suo numero, oppure «Crea tutti i tavoli in blocco» che li fa da 1 a N saltando quelli che ci sono gia'. I numeri sono quelli che usate voi in sala: e' l'unico modo perche' la coda ordini dica qualcosa a chi la legge.",
          },
          ...(modules.qr_ordering
            ? [
                {
                  titolo: "Stampa i codici",
                  testo:
                    "«Scarica» prende l'immagine di quel tavolo: si stampa e si attacca dove si vede da seduti. Ogni codice vale solo per il suo tavolo, quindi non si scambiano fra loro.",
                  punti: [
                    "Eliminare un tavolo invalida il QR gia' stampato: chi lo inquadra non riesce piu' ad aprire il tavolo.",
                  ],
                },
              ]
            : []),
          ...(modules.reservations
            ? [
                {
                  titolo: "Posti a sedere",
                  testo:
                    "Quante persone stanno a ogni tavolo, e quali tavoli si possono dare a chi prenota online. Il bancone e i tavoli che tenete per chi passa si tolgono togliendo la spunta «prenotabile». Senza questi numeri la prenotazione non sa se il gruppo di sei ci sta.",
                  punti: [
                    "In cima alla pagina si legge quante persone entrano davvero e qual e' il gruppo piu' grande che riuscite a sistemare accostando i tavoli.",
                  ],
                },
              ]
            : []),
        ],
      };

    case "staff":
      return {
        titolo: "Staff",
        passi: [
          {
            titolo: "Chi puo' entrare nella gestione",
            testo:
              "L'elenco sono gli account del locale, non le persone del turno. «Titolare» puo' gestire account, impostazioni e abbonamento; «Staff» lavora e basta.",
          },
          ...(isOwner
            ? [
                {
                  titolo: "Aggiungere un account",
                  testo:
                    "Email e una password di almeno sei caratteri, che gli dai tu a voce. Cambiarsela poi e' affare suo: lo fa da «Il tuo accesso», in fondo al menu.",
                },
                {
                  titolo: "Reimpostare e togliere",
                  testo:
                    "«Reimposta» scrive una password nuova e butta subito fuori quell'account da tutti i dispositivi: e' quello che si fa quando un telefono si perde. «Elimina» chiude l'accesso per sempre. Il tuo account, da qui, non si tocca.",
                },
                {
                  titolo: "Chi vede cosa",
                  testo:
                    "Se il locale ha i reparti, in Impostazioni si dice a quale reparto appartiene ogni account: chi ne ha uno vede solo la coda di quello che prepara. I titolari vedono tutto comunque.",
                },
              ]
            : [
                {
                  titolo: "Cosa puoi fare da qui",
                  testo:
                    "Guardare. Aggiungere o togliere account e' cosa del titolare. La tua password e la verifica in due passaggi si cambiano da «Il tuo accesso», in fondo al menu di sinistra.",
                },
              ]),
        ],
      };

    case "fatturazione":
      return {
        titolo: "Abbonamento e fatture",
        passi: [
          {
            titolo: "Il tuo piano",
            testo:
              "In cima c'e' il pacchetto attivo, cosa costa e quando si rinnova. In prova, al posto del rinnovo trovi la data in cui la prova finisce.",
          },
          {
            titolo: "I dati con cui ti fatturiamo",
            testo:
              "Ragione sociale, indirizzo, partita IVA. Codice destinatario e PEC sono alternativi: al Sistema di Interscambio ne basta uno, e se non sai quale sia lo sa il tuo commercialista. Senza, la fattura ti arriva comunque per email.",
          },
          {
            titolo: "I documenti",
            testo:
              "L'elenco delle fatture emesse, con stato e scadenza: si aprono per vedere il dettaglio. Sotto, se ci sono, i contratti e gli allegati che ti abbiamo caricato.",
          },
          {
            titolo: "Se il servizio si ferma",
            testo:
              "Quando la prova finisce o resta una fattura da saldare, la dashboard si chiude e di tutto il menu resta in piedi solo questa voce: e' da qui che si legge cosa si deve e si riparte.",
          },
        ],
      };

    case "impostazioni":
      return {
        titolo: "Impostazioni",
        passi: [
          {
            titolo: "Reparti: chi prepara cosa",
            testo:
              "Cucina, pizzeria, bar. Senza reparti tutto resta in un'unica coda, che per un locale piccolo va benissimo. Creandoli, «Chi prepara cosa» manda ogni categoria del menu al suo reparto, e «Account e reparti» decide chi vede quale coda — i titolari vedono tutto comunque.",
            punti: [
              "Le categorie lasciate sulla coda generale restano visibili a tutti: meglio nel posto sbagliato che perse.",
            ],
          },
          {
            titolo: "Orari e giorni di chiusura",
            testo: modules.reservations
              ? "Da qui escono le fasce che il cliente vede quando prenota e i ritiri proposti in cassa. Due intervalli per giorno, se chiudete nel pomeriggio. Feste e ferie si segnano sotto: in quei giorni non si prenota e non si propone nessun ritiro, anche se in settimana sarebbe aperto."
              : "Da qui si calcolano le fasce di ritiro e consegna proposte in cassa. Due intervalli per giorno, se chiudete nel pomeriggio. Feste e ferie si segnano sotto: in quei giorni non si propone nessun ritiro, anche se in settimana sarebbe aperto.",
          },
          ...(modules.reservations
            ? [
                {
                  titolo: "Prenotazione online",
                  testo:
                    "Quanto tiene occupato un tavolo, quante persone si accettano dal sito, con quanto preavviso e fino a quanti giorni in avanti, e se le prenotazioni si confermano da sole. Qui si dice anche quanti tavoli si possono accostare e quante sedie in piu' ci stanno: e' da li' che esce il gruppo piu' grande che riuscite ad accettare.",
                },
              ]
            : []),
          ...(modules.web_orders && (modules.takeaway || modules.delivery)
            ? [
                {
                  titolo: "Ordini dal sito",
                  testo:
                    "Un blocco per canale, e si accendono uno alla volta: si puo' vendere il ritiro dal sito e tenere le consegne al telefono. Acceso, il locale ha la sua pagina pubblica su /ordina — il link da mettere su Google, sui social e sul volantino.",
                  punti: [
                    "Ogni canale ha le sue regole: preavviso, passo delle fasce, giorni in avanti, minimo d'ordine, accettazione automatica e la riga da mostrare al cliente. Il ritiro si prepara in venti minuti e la consegna in quaranta: un numero solo per tutti e due vorrebbe dire tararlo sul peggiore.",
                    "I pezzi per fascia sono l'unica cosa in comune, ed e' giusto cosi': sono il tetto della cucina, il forno e' lo stesso, e due numeri separati direbbero venti dove il vero e' dieci. Un pezzo e' una pizza, una birra, un tagliere.",
                    "Come funziona: tetto 10, e per le 20:00 avete gia' preso 6 pizze e 2 birre. Chi arriva con 2 pezzi vede ancora le 20:00; chi ne ha 4 vede le 20:15; chi ne ordina 11 in una volta non vede nessun orario e la pagina gli dice di chiamarvi. Occupano la fascia anche gli ordini battuti in cassa e quelli ancora da accettare.",
                    "E' per fascia, non all'ora: con fasce da 15 minuti un tetto di 10 vuol dire fino a 40 pezzi in un'ora.",
                    "Con l'accettazione automatica gli ordini di quel canale entrano in cucina da soli. Spenta, restano «da accettare» in coda e la comanda parte quando li accettate: e' quello che serve il sabato sera.",
                    "Le mail si accendono una per una, e non sono tutte per la stessa persona. «Mail al cliente» e' la conferma: ordine ricevuto, accettato, spostato o rifiutato. «Anche gli aggiornamenti» sono le tappe che segnate dalla coda: in preparazione, pronto, partito. «Avviso a voi» invece e' per voi, sulla vostra casella, a ogni ordine nuovo.",
                    "Se tenete la coda sempre aperta, «Avviso a voi» spegnetelo: sapete gia' che e' arrivato, e vi riempie la casella per niente. Se il pannello lo aprite due volte al giorno tenetelo acceso, o gli ordini scadono mentre nessuno guarda.",
                    "Spegnendo «Mail al cliente» la pagina smette anche di chiedergli l'indirizzo: chiederlo per non scrivergli mai e' promettergli una conferma che non arriva. Il link per seguire l'ordine ce l'ha lo stesso, e si aggiorna da solo.",
                    "Il minimo d'ordine del domicilio si somma a quello delle zone: fra i due comanda il piu' alto.",
                  ],
                },
              ]
            : []),
          ...(modules.web_orders && modules.delivery
            ? [
                {
                  titolo: "Zone di consegna",
                  testo:
                    "Righe «fino a X km»: una sola vuol dire costo fisso per tutti, e l'ultima e' il confine oltre il quale non si consegna — a chi resta fuori si propone il ritiro. Ogni riga ha il suo minimo d'ordine, e sotto c'e' la soglia oltre la quale il viaggio e' offerto.",
                  punti: [
                    "La distanza e' quella in linea d'aria piu' il 30%, che e' lo scarto medio delle strade: scrivete i chilometri come li fareste in macchina.",
                    "Dove l'aria mente — un fiume, una tangenziale — la distanza si legge sull'ordine e il costo si corregge prima di accettarlo.",
                  ],
                },
              ]
            : []),
          {
            titolo: "Stampa automatica",
            testo:
              "Le comande escono appena l'ordine arriva, non quando si paga: chi prepara deve partire subito. Ogni canale ha il suo interruttore.",
            punti: [
              "In fondo alla pagina c'e' «Postazione di stampa»: il computer attaccato alla stampante deve avere questa pagina aperta e i reparti giusti selezionati, o le comande restano ferme in coda — e se restano ferme, qui te lo diciamo.",
            ],
          },
          {
            titolo: "Il resto",
            testo:
              "La posta del locale e' il server da cui partono le mail ai clienti: conferme, spostamenti, link per disdire. Le cose piu' piccole — il suono delle chiamate al tavolo, la firma in fondo al menu — stanno nelle rispettive schede, ognuna col suo «Salva».",
          },
        ],
      };

    case "account":
      return {
        titolo: "Il tuo accesso",
        passi: [
          {
            titolo: "E' tuo, non del locale",
            testo:
              "Questa pagina riguarda l'account con cui sei entrato adesso. Ci si arriva anche stando a una postazione che vede solo la coda: la password e' di chi lavora, non del ruolo che ha.",
          },
          {
            titolo: "Password",
            testo:
              "Cambiandola, chi era entrato con la vecchia si ritrova fuori. Tu resti dentro. Se te l'ha data il titolare, cambiarla e' la prima cosa da fare.",
          },
          {
            titolo: "Verifica in due passaggi",
            testo:
              "Dopo la password, sei cifre: dall'app di autenticazione sul telefono, oppure per mail. Se la password gira, da sola non basta piu'. Telefono perso, il gestore del servizio la azzera e si riparte da capo.",
          },
        ],
      };

    default:
      // Le pagine che non hanno niente da spiegare — il servizio sospeso, per
      // dirne una — non devono mostrare un pulsante che apre il vuoto.
      return null;
  }
}
