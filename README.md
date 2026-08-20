# Comanda (nome di lavoro)

Ordinazione al tavolo via QR, coda ordini per lo staff e conto diviso per
persona. Si appoggia _sopra_ la cassa esistente del locale: non incassa soldi e
non emette documenti fiscali.

Stack: Next.js (App Router) + TypeScript + Tailwind v4 + PostgreSQL (Drizzle).
Multi-tenant: ogni locale vive su un proprio sottodominio e **si aggiunge
configurando dati, mai duplicando codice o deploy**.

## Requisiti

- Node.js 20+
- PostgreSQL (via Docker o locale)

## Avvio in sviluppo

1. `npm install`
2. Copia `.env.example` in `.env.local` (metti una frase lunga a caso in
   `APP_SECRET`: senza, la posta dei locali non si configura), poi
   `docker compose up -d` e `npm run db:migrate`
3. `npm run dev`
4. Apri nel browser (Chrome gestisce i sottodomini `*.localhost` da solo):
   - Landing: http://localhost:3000
   - Super-admin: http://localhost:3000/admin
   - Dashboard di un locale: http://bar-centrale.localhost:3000/dashboard
   - Un tavolo: si arriva solo scansionando il QR (vedi sotto)

## Aggiungere un locale

Da `/admin` → **Aggiungi un locale**. Il flusso guidato chiede profilo,
anagrafica, aspetto, moduli, numero di tavoli e credenziali del titolare, e
crea tutto in un passaggio. Nessuno step richiede di toccare il codice.

Lo stesso percorso via script (utile per ricreare un locale in modo
riproducibile): vedi `scripts/seed-noya.ts`, che chiama la stessa funzione
usata dal pannello.

## Come e' organizzato

| Percorso | Cosa fa |
| --- | --- |
| `app/page.tsx` | landing pubblica (dominio radice) |
| `app/admin/` | super-admin: elenco locali, onboarding, moduli, aspetto |
| `app/dashboard/` | pannello del singolo locale (menu, tavoli, ordini, conti) |
| `app/t/[table]/` | pagina cliente, raggiungibile solo con sessione da QR |
| `app/t/[table]/apri/` | destinazione del QR: valida il token e apre la sessione |
| `app/prenota/` | prenotazione pubblica del tavolo, sul sito del locale |
| `lib/prenotazioni.ts` | fasce libere, assegnazione dei tavoli, impostazioni |
| `lib/prenotazioni-mail.ts` | le mail al cliente, dalla casella del locale |
| `lib/segreti.ts` | cifratura dei segreti dei locali (password della posta) |
| `lib/tenant-host.ts` | ricava il locale dal sottodominio |
| `lib/themes.ts` | preset di tema versionati nel codice |
| `lib/branding.ts` | preset + scostamenti del locale -> variabili CSS |
| `lib/modules.ts` | catalogo dei moduli e stato per locale |
| `lib/billing/` | listino, contratti, fatture e incassi verso i locali |
| `lib/profiles.ts` | profili di locale (lounge, pub, ristorante) |
| `lib/onboarding.ts` | creazione completa di un locale |
| `lib/table-session.ts` | sessione tavolo a scadenza |
| `lib/sedute.ts` | tavoli accostati: chi sta dove, e su quale conto |
| `lib/sala.ts` | la sala vista dall'alto: occupati, liberi, da quanto |
| `scripts/` | seed di un locale e import del suo menu |

## Come funziona il tema per locale

I preset stanno in `lib/themes.ts` (codice, versionati). Ogni locale sceglie un
preset e puo' sovrascrivere logo, colore brand e tema di default: quei valori
stanno sul record del tenant. `app/layout.tsx` risolve il locale dall'host e
inietta le variabili CSS, quindi `globals.css` resta solo il fallback.

Aggiungere un cliente con un look nuovo = scegliere un preset e caricare il
logo. Aggiungere un preset nuovo = una voce in `lib/themes.ts`.

## Come funzionano i moduli

`lib/modules.ts` e' il catalogo (ordini QR, sotto-conti, chiamata cameriere,
prenotazione, pagamenti, agent AI, fedelta). Lo stato per locale sta in `tenant_modules`; le
righe mancanti ricadono sul default del catalogo, cosi' un modulo aggiunto dopo
funziona anche sui locali gia' esistenti senza migrazioni di dati.

I moduli si controllano sia nella UI sia nelle server action: spegnere un
modulo lo disattiva davvero, non lo nasconde soltanto.

## Skin del menu: un file per locale

Il tema (colori, font) e la **skin** sono due cose diverse. Il tema sono dati;
la skin e' codice: decide layout, animazioni e classi della pagina cliente.

Ogni skin sta in `components/skins/` e implementa il contratto in
`skins/types.ts`: `Hero`, `CategoryNav`, `CategorySection`, `ProductCard`, piu'
un foglio CSS opzionale. **Una skin non conosce il carrello, non parla col
server e non decide i prezzi**: quella logica sta tutta in `OrderClient` ed e'
identica per ogni locale. Cambiare skin cambia l'aspetto, mai il comportamento.

Le skin oggi disponibili:

| Chiave | Per chi |
| --- | --- |
| `base` | tutti: lista sobria, e' il default di un locale nuovo |
| `noya` | Noya Lounge Bar: nero, accento per categoria, rilievo 3D allo scroll |

Disegnare un look su misura per un cliente = un file qui accanto piu' una riga
in `skins/index.ts`, poi si sceglie dal pannello. Il resto del prodotto non si
tocca.

## Menu: prodotti e formati

Un prodotto ha un prezzo suo. Se ha piu' **formati** (`menu_product_variants`)
— "Porzione"/"Shot" per i distillati, "Base"/"Premium" per i gin, "50 cl"/"75
cl" per l'acqua — il listino mostra "da € X" e toccare "+" apre la scelta del
formato invece di aggiungere subito.

Il prezzo e il nome finiscono nell'ordine come istantanea: se il menu cambia
dopo, gli ordini gia' inviati restano quelli. Come per i prodotti, prezzo e
nome della variante vengono riletti dal database al momento dell'ordine e mai
presi dal client, e la variante deve appartenere al prodotto richiesto.

## Sessione al tavolo

Il QR stampato porta a `/t/<n>/apri?k=<token>`. Il token e' permanente e
identifica il tavolo; scansionandolo si apre una **sessione a scadenza**
(default 2 ore, configurabile per locale). Scaduta o revocata — lo staff che
chiude il conto la revoca — bisogna riscansionare il QR.

Senza sessione valida per quel preciso tavolo, la pagina cliente, le server
action e le API pubbliche rispondono tutte di no.

## La sala durante il servizio

`/dashboard/sala` e' la pianta dei tavoli con quello che di ognuno si sa
adesso: **da quanto sono seduti**, in quanti, quanto hanno consumato, se
aspettano qualcosa dalla cucina e se hanno chiamato. E' l'unica pagina che
risponde alle due domande che durante il servizio si gridano da una parte
all'altra della sala: «il sei e' libero?» e «quelli da quanto sono li'?».

Il tempo parte dal **primo segnale** che si ha di quel tavolo, in questo
ordine di certezza:

| Segnale | Cosa vuol dire |
| --- | --- |
| seduta aperta dalla sala | qualcuno ha premuto «Segna occupato»: e' il solo modo di saperlo prima che ordinino |
| ordine aperto | c'e' un conto in corso su quel tavolo |
| sessione del QR viva | hanno inquadrato il codice e stanno leggendo il menu |

Nessuno dei tre e' inventato dal software, e la pagina dice sempre quale sta
leggendo: «ha scansionato il QR» e «c'e' un conto aperto» non sono la stessa
cosa, e nasconderne la differenza vorrebbe dire far prendere decisioni su un
dato che non c'e'.

### Tavoli accostati senza prenotazione

La prenotazione sa gia' accostare due tavoli per un gruppo che non entra in uno
solo. In sala la stessa cosa capita senza che nessuno abbia prenotato: arrivano
in sei, il cameriere tira di fianco il tavolo libero. Da `/dashboard/sala` si
toccano i due tavoli e si preme **Unisci i tavoli** (`table_sittings`).

Da quel momento:

- risultano **occupati tutti e due**, in sala, nella scelta del tavolo del
  cameriere e nel conteggio della dashboard;
- il conto e' **uno solo**, intestato al capofila — il tavolo che ha gia'
  ordinato, o il numero piu' basso se non ha ordinato ancora nessuno;
- quello che si ordina **dal QR del tavolo accostato** finisce sul conto del
  gruppo, e chi guarda dal telefono vede il conto intero, non mezzo;
- il conto e la comanda si leggono **«Tavoli 4+5»**, perche' chi incassa deve
  sapere quanti tavoli sta chiudendo e chi porta il vassoio deve sapere dove
  cercare.

Chiudere il conto libera tutti i tavoli del gruppo e revoca le sessioni QR di
tutti. **Separa** li stacca senza chiudere niente: quello che era gia' stato
ordinato resta sul conto dov'e', perche' le comande sono partite e nessuno sa
piu' chi ha mangiato da che parte del tavolo lungo. Un tavolo dove qualcuno ha
gia' pagato non si unisce: la sua quota era stata calcolata su quel conto.

Le prenotazioni su piu' tavoli si uniscono da sole quando lo staff segna
«Arrivati»: quale fosse l'accostamento lo sapeva gia' la prenotazione.

Il giro completo si prova senza browser, su un locale finto che si cancella da
solo:

```
npx tsx scripts/prova-sala.ts
```

### Spostare un gruppo su un altro tavolo

Dalla sala si toccano il tavolo dove sta il conto e quello (o quelli) dove
deve andare: **Sposta il conto**. Nasce per la correzione piu' comune che non
si poteva fare — l'ordine battuto sul 5 invece che sul 6, o il QR inquadrato
al tavolo di fianco — dove l'unica uscita era annullare le righe, che restano
barrate sul conto per sempre. Serve anche quando il gruppo si sposta davvero:
il dehors che rientra perche' ha cominciato a piovere.

Si porta dietro tutto quello che era appeso a quei tavoli: ordini aperti,
`bill_settlements` di chi ha gia' pagato, chiamate del cameriere ancora in
attesa. La seduta viene aggiornata invece di rifatta, cosi' l'ora in cui si
sono seduti resta quella vera. Le sessioni QR dei tavoli di partenza vengono
revocate: chi e' rimasto li' col telefono in mano deve riscansionare, o
continuerebbe a ordinare su un conto che adesso e' da un'altra parte.

I tavoli d'arrivo devono essere liberi. Se uno e' occupato non e' uno
spostamento ma una fusione di due conti, e quella si chiama «unisci»: farla
passare di qui vorrebbe dire mescolare due tavolate per un tocco sbagliato.

## Prenotazione del tavolo

Modulo `reservations`, spento di default. Acceso, il locale espone
`https://<slug>.<dominio>/prenota`: una pagina pubblica — niente QR, niente
sessione — dove il cliente sceglie **quante persone, quando, a che ora**, in
quest'ordine. I recapiti si chiedono solo dopo aver mostrato un orario libero.

Un orario compare **solo se il gruppo ci sta davvero** per tutta la durata del
servizio. La disponibilita' nasce da tre cose, tutte configurabili dalla
dashboard del locale:

| Dove | Cosa si decide |
| --- | --- |
| Impostazioni → Orari di apertura | in che fasce si puo' prenotare |
| Tavoli → Posti a sedere | quanti posti ha ogni tavolo e quali sono prenotabili |
| Impostazioni → Prenotazione online | persone accettate, durata del tavolo, passo delle fasce, preavviso, giorni in avanti, conferma automatica, **tavoli accostabili** e **sedie in piu' per tavolo** |

### La sala non e' fatta di posti fissi

Il numero di tavoli non e' un vincolo: cinque tavoli da due, accostati,
diventano un tavolo da dieci, e un tavolo da due regge il terzo commensale con
una sedia in piu'. Sono due numeri per locale — quanti tavoli si possono unire
(1 = non si uniscono) e quante sedie si aggiungono a ognuno — perche' ci sono
locali che i tavoli li spostano e altri che, per i mobili o per il permesso di
occupazione, no.

Da qui la capienza vera: `posti dei tavoli prenotabili + sedie in piu'`, e il
gruppo massimo e' la somma dei tavoli piu' capienti che si riescono ad
accostare. Sono i due numeri mostrati in `Tavoli`.

L'assegnazione, fra tutte le combinazioni che tengono il gruppo, prende
**quella che spreca meno posti** — dare il tavolo da otto a due persone vuol
dire rifiutare la comitiva che chiama dieci minuti dopo — e a parita' di spreco
quella che sposta meno tavoli. I tavoli assegnati si salvano per numero
(`table_numbers`), lo stesso identificativo che usano ordini e conto.

Ogni prenotazione nasce in una transazione con un lucchetto per locale
(`pg_advisory_xact_lock`): due persone che premono "prenota" nello stesso
secondo non possono ricevere lo stesso tavolo.

Quello che l'automatico decide non e' l'ultima parola: da `Prenotazioni →
Cambia i tavoli` si toccano i numeri uno per uno e si guarda salire la
capienza («14 posti per 18 persone», verde quando bastano). Serve perche' la
sala vera ha vincoli che il software non conosce — la comitiva la si vuole
tutta sulla stessa fila, il tavolo in fondo balla, quei due si sentono solo se
stanno vicini. Ci sono anche i tavoli **non prenotabili** dal web: il bancone
non si da' a chi prenota da solo, ma per una comitiva lo si usa. Un tavolo gia'
impegnato si sceglie lo stesso, segnalato con il motivo — «c'e' gente seduta
adesso», «lo tiene Ferrari alle 20:30»: e' un avviso, non un divieto, ma chi
c'e' non si sposta da solo.

Se il gruppo era gia' segnato «arrivati», la correzione arriva anche in sala e
i tavoli diventano **esattamente** quelli scelti: il tavolo aggiunto risulta
occupato, quello tolto torna libero. La seduta resta quella di prima finche' un
tavolo e' in comune, cosi' «da quanto sono seduti» non riparte da capo. L'unico
tavolo che non si stacca e' quello dove sta il conto aperto: liberarlo
spezzerebbe in due il conto di gente che paga insieme.

Segnare «arrivati» un gruppo il cui tavolo e' ancora occupato non li fa
sedere: la dashboard dice cosa c'e' («c'e' ancora gente al tavolo 7, da 40
min») e lascia le due strade vere — **assegna un altro tavolo**, che apre il
selettore li' sotto, oppure **aspettano**, finche' quel conto non viene chiuso
dalla cassa. Farli accomodare lo stesso vorrebbe dire due tavolate su un conto
solo, e ce ne si accorge al momento di pagare.

### Le mail partono dalla casella del locale

In `Impostazioni → Posta del locale` il titolare mette indirizzo e **password
per applicazione** della propria casella. La password si salva cifrata
(`lib/segreti.ts`, AES-256-GCM con la chiave `APP_SECRET` dell'ambiente): senza
`APP_SECRET` la sezione lo dice e non salva niente, invece di scrivere una
password in chiaro. Un pulsante manda una mail di prova, cosi' la password
sbagliata si scopre in configurazione e non alla prima prenotazione.

Con la **conferma automatica** il tavolo e' preso subito e la conferma parte da
sola. Senza, la prenotazione resta `da confermare` e l'operatore ha tre uscite,
tutte con la loro mail:

| Azione | Cosa succede |
| --- | --- |
| Conferma | stato `confirmed`, al cliente arriva il tavolo confermato |
| Sposta | nuovo orario o numero di persone, tavoli riassegnati, stato `proposed`: **il cliente deve accettare dalla mail**, e finche' non lo fa il tavolo resta bloccato per lui |
| Rifiuta | stato `cancelled`, al cliente arriva l'annullamento |

Ogni mail contiene il link alla prenotazione (`/prenota/<token>`): da li' il
cliente rivede, accetta lo spostamento o disdice senza telefonare. Quando
disdice o rifiuta, un avviso torna sulla casella del locale. Se la mail non
parte — casella non configurata, cliente senza indirizzo, password scaduta — la
prenotazione vale lo stesso e in pannello si legge `mail non partita`.

Lo staff vede la giornata in `Dashboard → Prenotazioni`: conferma, sposta,
segna gli arrivati e i non presentati, cambia tavolo e scrive le prenotazioni
prese al telefono, che occupano i tavoli come tutte le altre.

## Fatturazione

Due mestieri diversi, due posti diversi.

**`/admin/fatturazione`** e' il registro: quanto entra al mese, cosa e' stato
incassato, cosa e' scaduto, chi va fatturato oggi. Il contratto del singolo
locale si scrive dalla sua scheda in `/admin/locali/<id>`, sezione _Contratto_.

**`/dashboard/fatturazione`** e' quello che vede il locale: il suo piano col
dettaglio canone piu' add-on, la data del prossimo rinnovo e le sue fatture.
Da li' compila anche **i propri dati fiscali** — partita IVA, sede, codice
destinatario — in un riquadro che sta chiuso finche' non manca qualcosa: sono
suoi, ce li ha lui, e farmeli dettare al telefono per ricopiarli a mano vuol
dire una cifra sbagliata ogni tanto e una fattura da rifare. Solo il titolare,
e mai le bozze: finche' un documento non e' emesso, per lui non esiste.

### Come e' fatto

| Percorso | Cosa fa |
| --- | --- |
| `lib/billing/listino.ts` | i pacchetti e i prezzi dei moduli, versionati nel codice |
| `lib/billing/contratti.ts` | il contratto di un locale e quando scade |
| `lib/billing/documenti.ts` | bozze, emissione, incassi, giro dei rinnovi |
| `lib/billing/emittente.ts` | i tuoi dati, IVA e marca da bollo |
| `lib/billing/prezzi.ts` | il listino del codice piu' i ritocchi fatti dal pannello |
| `lib/billing/impostazioni.ts` | prova, tolleranza, blocco automatico |
| `lib/billing/addons.ts` | i moduli che un locale paga a parte, al prezzo suo |
| `lib/billing/blocco.ts` | chi va spento per morosita' o prova finita, e chi riacceso |
| `lib/billing/archivio.ts` | i documenti caricati per un locale, fuori da public/ |
| `lib/billing/stati.ts` | etichette e colori, senza database |

Il **listino** parte dal codice e si ritocca dal pannello; il **contratto**
sta a database perche' e' un patto gia' fatto: se domani alzi i prezzi, chi ha
firmato continua a pagare quello che aveva accettato. Un locale nasce sempre in
prova; passarlo ad _Attivo_ e' la firma, ed e' li' che parte la prima scadenza
da fatturare.

Ogni locale puo' stare su uno dei due modelli: **abbonamento** (canone e
basta) oppure **installazione + assistenza** (una tantum all'inizio, poi il
canone di assistenza mensile).
L'attivazione entra nella prima fattura e in nessun'altra.

### Prezzi: valore di partenza e prezzo del singolo cliente

Sono due cose diverse e stanno in due posti diversi apposta.

Il **valore di partenza** vale per tutti e si cambia da
`/admin/fatturazione/listino`: prezzo dei pacchetti, prezzo dei moduli presi da
soli, durata della prova, quota sul transato, tolleranza sui pagamenti. Il
catalogo scritto in `lib/billing/listino.ts` resta il ripiego: quello che il
pannello non ha mai toccato prende il prezzo del codice, cosi' un pacchetto
aggiunto domani funziona senza che nessuno debba ricordarsi di prezzarlo.
«Rimetti i prezzi del codice» cancella tutti gli scostamenti.

Il **prezzo di un cliente** si scrive nella sua scheda, in
`/admin/locali/<id>`: canone, attivazione, quota sul transato e add-on. Quello
che c'e' scritto li' vince sempre sul listino, e un ritocco al listino sei mesi
dopo non lo tocca. E' la ragione per cui i due valori non condividono lo stesso
campo: il listino e' un'offerta, il contratto e' un patto gia' fatto.

Gli **add-on** sono i moduli che il locale paga fuori dal pacchetto (l'agent al
telefono, la fedelta'). Il pannello propone il prezzo di listino, tu lo
correggi, e da li' in poi resta il suo. Finiscono in fattura come righe a se',
non annegati nel canone.

### Prove gratuite

Ogni locale nuovo nasce in prova. La durata di partenza e' nelle regole; dalla
scheda del locale si allunga o si ricomincia, e si conta sempre da oggi — «altri
quindici giorni» a una prova finita tre settimane fa vuol dire quindici giorni
da adesso, non meno dodici.

### Quando il conto non torna

Ci sono due interruttori e restano distinti:

| | Cosa spegne | Chi lo tocca |
| --- | --- | --- |
| `tenants.suspended` | tutto, login compreso | io, da «Zona pericolosa» |
| `tenants.serviceBlocked` | ordinazione al tavolo, prenotazioni e pannello di lavoro | il conto: fattura scaduta oltre la tolleranza, o prova finita |

Il secondo **lascia entrare il titolare**: trova `/dashboard/sospeso` con
l'importo, le fatture e da dove si riparte. Uno che non riesce nemmeno a
leggere la fattura non paga piu' in fretta, chiama piu' arrabbiato.

Il blocco automatico e' **spento** di partenza: si accende dalle regole, e
finche' e' spento si spegne a mano dalla scheda del locale. Quando la fattura
risulta saldata il servizio **riparte da solo**, senza aspettare che me ne
accorga. C'e' anche «Riaccendi il servizio» per chi dice che il bonifico e'
partito e gli si crede: non incassa niente, la fattura resta da saldare.

Il giro completo — bozze dei rinnovi, documenti scaduti, chi va spento e chi va
riacceso — sta dietro «Prepara le bozze» in `/admin/fatturazione`.

### Il giro delle scadenze

Da `/admin/fatturazione`, il bottone **Prepara le bozze** guarda chi ha una
scadenza arrivata, crea la bozza e sposta avanti il rinnovo. E' un bottone e
non un lavoro automatico apposta: finche' i locali sono pochi voglio vedere
cosa sto per mandare prima che parta.

Una **bozza** non ha numero e si puo' cancellare. L'**emissione** e' il punto
di non ritorno: assegna il progressivo dell'anno, congela emittente e
destinatario dentro il documento e da li' si corregge solo con una nota di
credito.


### Cosa serve per fatturargli

Senza **ragione sociale, sede, provincia e partita IVA** non gli si emette
niente: `emettiDocumento` si rifiuta invece di produrre un documento che non e'
una fattura, e il pannello lo dice prima — sulla scheda del locale e con un
segno accanto al suo nome in `/admin/fatturazione`. Ragione sociale e indirizzo
stanno in _Anagrafica_, la partita IVA in _Dati per la fattura_.

Codice destinatario e PEC invece **non bloccano**: la fattura si emette lo
stesso e si consegna a mano. Compaiono come avviso perche' senza uno dei due
allo SDI non partira', e vale la pena scoprirlo adesso e non il giorno che si
collega il provider.

### Documenti del locale

Da `/admin/locali/<id>` si carica quello che riguarda il rapporto: contratto
firmato, preventivo, visura. PDF, immagini o Word fino a 15 MB.

I file **non stanno sotto `public/`**: un contratto con dentro partita IVA e
firma del titolare non deve essere scaricabile da chiunque indovini
l'indirizzo. Stanno in `archivio/<slug>/` con un nome casuale — fuori dal
servito e fuori da git — e ci si arriva solo da `/api/documenti/<id>`, che
prima guarda chi sta chiedendo: io da admin, il titolare solo ai suoi e solo a
quelli marcati **visibili**. A chiunque altro risponde 404 e non 403, perche'
«esiste ma non e' tuo» e' gia' troppo.

Quelli visibili compaiono nella pagina Abbonamento del locale: il contratto
suo se lo scarica da solo invece di chiedermelo per mail. Gli appunti miei si
caricano togliendo la spunta.
### Prima di poter emettere

I tuoi dati da emittente stanno nell'ambiente, non a database: `FATTURAZIONE_*`
in `.env.example`. Finche' mancano, la piattaforma fa tutti i conti e prepara
le bozze ma non emette niente, e il pannello lo dice in cima. `FATTURAZIONE_REGIME`
decide IVA e bollo: `forfettario` non applica IVA e mette i 2 euro di bollo
sopra i 77,47, `ordinario` applica il 22%.

L'invio allo **SDI** non c'e' ancora: le colonne (`sdi_status`, `sdi_id`) e
tutti i dati per farlo — partita IVA, codice destinatario, PEC del locale —
sono gia' raccolti, cosi' collegare un provider domani non chiede di rimettere
mano ai documenti gia' emessi. Anche **Stripe** e **PayPal** hanno il loro
posto pronto (`provider`, `provider_customer_id`, `provider_subscription_id`
sul contratto, `provider_ref` sull'incasso) ma nessuna chiamata: oggi gli
incassi si segnano a mano.

Il giro completo si prova con un locale finto che alla fine sparisce:

```
npx tsx scripts/prova-fatturazione.ts
```

## Roadmap

- [x] **M0** — scheletro + multi-tenant + pipeline
- [x] **M1** — tenant + menu + QR (database)
- [x] **M2** — ordine cliente (carrello + alias per persona)
- [x] **M3** — coda staff in tempo reale
- [x] **M4** — pre-conto + split per il cassiere
- [x] **M5** — configurazione per locale (tema, moduli, onboarding)
- [x] **M6** — prenotazione del tavolo dal sito del locale
- [ ] **M7** — import menu via OCR
- [ ] **M8** — pagamento Apple/Google Pay
- [ ] **M9** — agent AI consiglio drink, programma fedelta
