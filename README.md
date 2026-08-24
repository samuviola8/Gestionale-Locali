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
| `app/ordina/` | asporto e domicilio ordinati dal cliente sul sito del locale |
| `lib/ordini-web.ts` | fasce di ritiro, capienza della cucina, scrittura dell'ordine |
| `lib/consegna.ts` | zone di consegna, distanza e costo |
| `lib/ordini-mail.ts` | le mail al cliente che ha ordinato dal sito |
| `lib/mittente.ts` | il locale come mittente: casella, foglio delle mail, link |
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
prenotazione, asporto, consegna, ordini dal sito, pagamenti, agent AI,
fedelta). Lo stato per locale sta in `tenant_modules`; le
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

## Conti aperti

`/dashboard/bill` è dove si incassa: una scheda per conto, le persone che lo
dividono, quanto manca. In sala il conto raccoglie **tutti gli ordini di quel
tavolo**; fuori dalla sala il conto **è** l'ordine, perché non c'è un posto a
cui appoggiarsi e ogni asporto è una cosa a sé.

Le pillole in alto filtrano per provenienza — sala, banco, asporto, domicilio —
e sono lo stesso componente della coda ordini (`components/FiltroCanali.tsx`):
chi incassa gli asporti non deve scorrere i tavoli, ed è la stessa fila con lo
stesso comportamento perché due copie diventano due comportamenti al primo
ritocco.

### Modificare un conto

Dentro «modifica» ci sono quattro cose, e tutte partono da una telefonata:

| Cosa | Quando serve |
| --- | --- |
| annulla | il prodotto è finito: esce dal totale e resta barrato, così si sa perché il conto è quello |
| sposta | la voce è finita sul conto sbagliato: su una persona, o divisa tra chi se l'è presa |
| nota | «senza cipolla» detto dopo, o scritto male da chi l'ha battuto |
| **+ Aggiungi al conto** | «mi aggiungete due birre» a ordine già partito |

L'aggiunta prende due strade diverse perché i due conti sono diversi. **Al
tavolo** nasce un ordine nuovo sullo stesso tavolo: entra in coda con l'ora di
adesso, e chi prepara vede una comanda arrivata adesso. **Fuori dalla sala** le
righe si attaccano all'ordine che è il conto — l'ora concordata, l'indirizzo e
il canale restano quelli — e parte una comanda con **solo le righe nuove**,
marcata `AGGIUNTA`. Ristampare l'ordine intero vorrebbe dire far rifare da capo
in cucina quello che stavano già preparando, ed è il motivo per cui
`creaComande()` accetta l'elenco delle righe da stampare.

Il resto lo tiene fermo la stessa regola di sempre: quello che è **già
incassato non si tocca**, né il prezzo né la nota né l'annullamento. E un
ordine dal sito ancora `pending` non si modifica da qui: prima lo si accetta in
coda, che è il posto dove parte anche la comanda.

La nota corretta dopo **non ristampa niente**: la comanda con la nota vecchia è
già in cucina, e una seconda uguale farebbe rifare il piatto. La nota nuova si
vede in coda, dove chi prepara guarda; se la carta è già uscita, quella si dice
a voce — e il riquadro lo ricorda a chi la sta scrivendo.
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

## Asporto e domicilio dal sito

Ci vogliono **tre si'**, e sono tre cose diverse:

| Dove | Cosa dice |
| --- | --- |
| modulo `web_orders` | questo locale ha comprato la vendita dal sito |
| modulo `takeaway` / `delivery` | questo locale fa asporto, o consegna (anche solo in cassa) |
| `Impostazioni → Ordini dal sito` | e quel canale lo prende **anche dal sito**, con le sue regole |

Chi gli ordini li vuole solo al telefono tiene i moduli accesi e l'interruttore
spento; chi non ha comprato `web_orders` non ha nemmeno la pagina. Con tutti e
tre il locale espone `https://<slug>.<dominio>/ordina`, e senza risponde 404
come qualsiasi indirizzo inventato.

I due canali si accendono **uno alla volta** e hanno regole loro, in due blocchi
separati: preavviso, passo delle fasce, giorni in avanti, minimo d'ordine,
accettazione automatica e la riga da mostrare al cliente. Il ritiro si prepara
in venti minuti e la consegna in quaranta; il ritiro si prende fino a stasera e
la consegna solo su prenotazione; il ritiro entra da solo in cucina e la
consegna la si guarda prima. Un numero solo per tutti e due vorrebbe dire
tararlo sul peggiore e rovinare l'altro. Le regole stanno in un jsonb per
canale (`tenants.web_order_channels`), cosi' un terzo canale non chiede sette
colonne nuove.

La differenza con la prenotazione non e' tecnica: un tavolo prenotato e'
spazio, e se salta resta un tavolo vuoto; un ordine e' roba cucinata, che il
locale ha gia' pagato quando il cliente non si presenta. Da qui vengono le tre
regole che reggono tutto il resto.

### 1. La capienza e' quella della cucina, e si misura in pezzi

Nella prenotazione la domanda e' "quante persone"; qui e' "quanti pezzi". Un
ordine da trenta pizze vede meno orari liberi di uno da due, ed e' giusto: sono
le stesse trenta pizze che qualcuno deve infornare. Il tetto (`Pezzi per
fascia`) e' **uno solo per asporto e domicilio** — il forno e' lo stesso, e due
numeri separati direbbero venti dove il numero vero e' dieci. Occupano la
fascia anche gli ordini battuti in cassa e quelli ancora da accettare, come una
prenotazione `pending` tiene occupato il tavolo mentre il locale decide.

Con un esempio: tetto **10**, e per le 20:00 sono gia' stati accettati 6 pizze
e 2 birre — 8 pezzi. Chi arriva col carrello da 2 pezzi vede ancora le 20:00;
chi ne ha 4 vede le 20:15; chi ne ordina 11 in una volta non vede nessun orario
e la pagina gli dice di chiamare. Il conto e' **per fascia, non all'ora**: con
fasce da 15 minuti un tetto di 10 vuol dire fino a 40 pezzi in un'ora, ed e'
l'errore in cui si cade leggendolo di fretta.

Tutto il resto invece e' **per canale** — preavviso, passo delle fasce, giorni
in avanti, minimo d'ordine, accettazione automatica, riga per il cliente: una
consegna ha in piu' il giro di chi consegna, e un locale puo' fare solo ritiri.

### 2. Si accetta a mano

L'ordine dal sito nasce `pending`: non entra in coda, non e' un conto aperto e
**la comanda non parte**. Arriva anche mentre la cucina e' in ginocchio, o con
la mozzarella finita, o da un indirizzo che si rivela dall'altra parte del
fiume. In `Coda ordini` sta in cima, sotto «Da accettare», dove prima di dire
di si' si puo' cambiare l'ora concordata — il campo si batte a mano, `+15` e
`+30` sono la scorciatoia — correggere il costo di consegna e **cambiare il
prezzo di ogni riga**, come al tavolo: l'ingrediente in piu' concordato al
telefono, lo sconto fatto a voce. Un prezzo si corregge adesso o si scopre in
cassa, davanti al cliente, e il totale corretto e' quello che gli arriva nella
mail di conferma e sulla sua pagina. Accettandolo entra in coda come tutti gli
altri e **in quel momento** parte la comanda. Chi preferisce puo' accendere
l'accettazione automatica; resta manuale per gli ordini di cui non si e'
trovato l'indirizzo.

Sul filo va sempre l'orario intero, mai i minuti da sommare: `+15` e un'ora
battuta nel campo sono la stessa cosa, e il server rilegge la regola in
`oraSpostata()`. Oltre le dodici ore dall'ora concordata non e' piu' lo stesso
ordine e l'accettazione si ferma, invece di confermare di nascosto all'ora
vecchia — quella e' la conferma che fa arrivare la gente quando il locale non
l'aspetta. Se l'ora torna quella di prima non parte nessuna mail: un cambio che
non c'e' stato non si annuncia.

«Sospendi per stasera» chiude il rubinetto quando la cucina e' al completo: la
pagina resta in piedi e dice ai clienti di chiamare. Si riapre da sola a
mezzanotte, perche' l'interruttore che resta giu' e' quello che tiene un locale
chiuso al web per una settimana senza che nessuno se ne accorga.

### 3. Il costo di consegna esce dalla distanza

Le zone si scrivono in `Impostazioni → Zone di consegna` come righe «fino a X
km → costo, minimo d'ordine»: una riga sola vuol dire costo fisso per tutti,
l'ultima e' il confine oltre il quale non si consegna — e a chi resta fuori si
propone il ritiro. Sopra una soglia la consegna si offre.

La distanza serve **sempre**, anche a chi mette il costo fisso, perche' e' lei
a dire fin dove si va. Si misura in linea d'aria piu' il 30% (lo scarto medio
delle strade); con `GEO_ROUTING=osrm` si passa alla strada vera, una chiamata
per ordine, e se il router non risponde si torna alla stima. Dove l'aria mente
— il fiume, la tangenziale — la distanza si legge sull'ordine e il costo lo
corregge chi accetta.

Il numero lo calcola sempre il server: dal browser arrivano gli identificativi
dei prodotti e il testo dell'indirizzo, mai un prezzo e mai un chilometro.
Prezzi, disponibilita' per canale, distanza e costo si rileggono all'invio, e
la fascia si ricontrolla dentro la transazione che scrive l'ordine, col
lucchetto per locale.

### Quello che vede il cliente

| Dove | Cosa |
| --- | --- |
| `/ordina` | canale, menu del canale **con la ricerca**, carrello con **una nota per riga**, indirizzo **con i suggerimenti** e costo di consegna calcolato, giorno e ora fra quelle che la cucina regge davvero |
| `/ordina/<token>` | a che punto e' il suo ordine, **aggiornato da solo**, con il totale e come si paga |

Sul sito del locale il tasto «Ordina» sta accanto a «Prenota un tavolo», e compare con le stesse regole della pagina.

Chi ha appena ordinato ritrova il suo ordine in cima a `/ordina`: il token sta
in un cookie di sette giorni, cosi' chi ricarica la pagina, la chiude o torna il
giorno dopo non deve cercare la mail. La striscia sparisce da sola quando
l'ordine e' chiuso o rifiutato.

Si paga **al ritiro o alla consegna**: online non si incassa niente (il modulo
`payments` e' un'altra cosa e non e' ancora rilasciato). Il menu non e' tutto
ordinabile: ogni prodotto ha le spunte «Si porta via» e «Si consegna», accese
di default, e quello che resta in sala — il cocktail versato, la birra alla
spina — si segna li'.

Ogni riga del carrello ha la sua nota — «senza cipolla», «ben cotta», «poco
ghiaccio» — su qualunque prodotto, come al tavolo: e' la cosa che al telefono
si dice sempre, e senza un posto dove scriverla il cliente o telefona lo stesso
o rinuncia. La nota fa parte della chiave della riga, quindi la stessa pizza
con due note diverse sono **due righe** — in cucina sono due cose diverse — e
scrivendo su una la nota che ha gia' un'altra le due tornano una sola. I
prodotti segnati «su richiesta» sono un altro caso: li' la nota e' il prodotto,
e senza non si aggiungono al carrello.

### A che punto e' l'ordine

Il cliente che aspetta guarda l'orologio, e se non ha niente da guardare
chiama. Il link col token e' quello che gli sostituisce la telefonata: da li'
vede le tappe, e la pagina si ripassa da sola ogni venti secondi finche'
l'ordine e' in ballo (`/api/ordine/<token>`). Chi mette il telefono in tasca e
lo riprende dopo dieci minuti trova la pagina gia' aggiornata: si rilegge anche
quando la scheda torna in primo piano, invece di far vedere lo stato di prima.

Non sono solo le tappe: dal sondaggio arriva anche **l'ora concordata**, ed e'
la cosa che il locale cambia piu' spesso mentre il cliente sta guardando —
accettando un ordine per le 20:30 lo rimanda alle 21. Per questo la riga
dell'ora sta dentro il componente che si aggiorna e non nella pagina servita
dal server: un orario che si sistema solo ricaricando e' un orario che il
cliente non vede, e lui a quell'ora esce di casa. Quando cambia mentre la
pagina e' aperta compare anche un avviso — la riga in grigio piccolo che si
riscrive da sola, da sola non si nota.

| Tappa | Da dove esce |
| --- | --- |
| ricevuto | l'ordine e' `pending`, il locale non l'ha ancora guardato |
| confermato | accettato, a mano o da solo |
| in preparazione | la cucina si e' messa sotto (`preparing`) |
| pronto | qualcuno ha premuto «È pronto» (`orders.ready_at`) |
| in consegna | ed «È partito» (`orders.out_at`) — solo per il domicilio |
| ritirato / consegnato | l'ordine e' chiuso (`served`) |

Pronto e partito sono **due orari, non due stati**: la cucina ha gia' la sua
macchina degli stati per le righe della comanda, e infilarci dentro due caselle
nuove avrebbe voluto dire toccarla per una cosa che riguarda il cliente e non
lei. `faseDi()` li legge in ordine — rifiutato batte chiuso, chiuso batte
partito, partito batte pronto — e per l'asporto la tappa «in consegna» non
compare nemmeno: non gli arrivera' mai.

I tasti stanno in fondo alla scheda in `Coda ordini`, in fila: **Inizia a
preparare → È pronto → È partito → Ritirato**. Sono gli stessi che fanno
partire le mail al cliente, e «non era pronto» torna indietro quando qualcuno
ha premuto per sbaglio.

### Le mail

Partono dalla casella del locale, la stessa delle prenotazioni
(`Impostazioni → Posta`), e sono **tre**, con tre interruttori per canale: due
parlano al cliente, una parla a chi lavora.

| Interruttore | A chi | Cosa manda |
| --- | --- | --- |
| `Mail al cliente` | al cliente | «ricevuto» quando l'ordine arriva e il locale accetta a mano, «confermato» quando lo accetta (o subito, con l'accettazione automatica), «spostato» se gli e' cambiata l'ora, «rifiutato» se non si e' potuto prendere |
| `Anche gli aggiornamenti` | al cliente | «in preparazione», «pronto», «e' partito»: le tappe che il locale segna dalla coda |
| `Avviso a voi` | al locale | una riga sulla casella del locale a ogni ordine nuovo, con nome, telefono e cosa hanno preso |

Divisi perche' sono mestieri diversi. La conferma la vuole chiunque prenda
ordini dal sito; gli aggiornamenti sono tre mail in mezz'ora, che per una
consegna dicono al cliente di scendere e per un ritiro a mezzogiorno possono
essere di troppo. E l'avviso al locale non c'entra niente con i primi due: e'
per chi il pannello non ce l'ha sempre davanti — la coda sta su un altro
schermo, e un ordine arrivato mentre nessuno guarda e' un ordine che scade —
mentre chi la coda la tiene aperta tutta la sera se lo toglie e non si riempie
la casella. Prima erano una cosa sola, e configurare la posta voleva dire
accettarle tutte.

Chi le spegne tutte lascia comunque al cliente il link: la pagina si aggiorna
da sola lo stesso. Ogni mail al cliente porta quel link, ed e' anche la sua
copia di riserva quando il cookie scade o cambia telefono.

L'email del cliente si chiede dove serve davvero: posta configurata **e**
`Mail al cliente` acceso su quel canale. Spento, non si chiede nemmeno —
chiederla per non mandare niente e' prometterla, ed e' una promessa per canale:
un locale puo' scrivere a chi ritira e non a chi si fa consegnare. Se la mail
non parte l'ordine vale lo stesso, come per le prenotazioni.

### La firma

In fondo alle pagine del cliente c'è una riga piccola: «Menu con **Comanda**»
al tavolo, «Ordina con **Comanda**» su `/ordina` e sulla pagina dell'ordine.
Porta alla vetrina, ed è lo stesso interruttore per tutte
(`tenants.menu_branding`, `Impostazioni → Menu al tavolo`): quelle pagine il
locale le presenta come sue, e chi non la vuole deve poter dire di no senza
chiamarmi. È in coda e non fissa — chi ordina non deve averla fra i piedi — e
non compare nel carrello né nella conferma.

## Com'è andata

A cose fatte si chiede al cliente com'è andata: sulla pagina dell'ordine dal
sito quando l'ordine è chiuso, e al tavolo subito dopo l'invio — lì è una riga
sola che si chiude, perché chi sta mangiando non deve trovarsi un questionario
addosso. Si accende in `Impostazioni → Com'è andata` e nasce **spenta**: è una
domanda che il locale fa ai suoi clienti, e la decide lui.

Sono **due domande con due padroni**, e per questo due tabelle.

| Tabella | Di chi è | Dove si legge |
| --- | --- | --- |
| `reviews` | del locale | `Dashboard → Recensioni`, e basta: non le pubblica nessuno |
| `testimonials` | di Comanda | servono alla vetrina, e ci finiscono solo col consenso |

La recensione del locale è legata all'ordine, **una per ordine**: è quello che
la rende verificata — dietro c'è qualcuno che ha consumato davvero — ed è anche
il motivo per cui non serve chiedere chi sei. Un secondo invio non ne scrive
una seconda e non riscrive la prima. Serve al locale per accorgersi che la
carbonara di venerdì non andava **prima** che quella frase finisca su Google, e
a quel punto una telefonata vale più di una risposta pubblica.

Le testimonianze invece sopravvivono al locale che se ne va: il legame è debole
(`on delete set null`) e il nome è copiato accanto, così restano leggibili. Non
si pubblica niente senza un consenso esplicito, registrato con **la data e il
testo approvato in quel momento** — un consenso senza il testo è un ricordo — e
la pubblicazione resta una scelta a mano: `published` nasce falso.

### La testimonianza del gestore

L'altra metà, e quella che conta per la vetrina: un cliente racconta com'è
stato ordinare — «comodo, non ho telefonato» — e fa volume; un gestore racconta
com'è lavorarci, e a un altro gestore interessa la seconda. La chiede la
dashboard dopo il primo mese (`GIORNI_PRIMA_DI_CHIEDERE`), solo al titolare —
a un turno di sala non si chiede se rifarebbe l'acquisto — una volta sola, e
«non adesso» la rimanda di due mesi con un cookie. Chi ha risposto non la vede
più.

Anche qui la pubblicazione è una scelta a mano: le raccolgo tutte, `published`
nasce falso, e in vetrina ci va quello che ha senso.

### Due regole che non sono opinioni

**Il link al profilo pubblico si mostra a chiunque abbia risposto, con
qualunque voto.** Mandarci solo i contenti e tenersi le lamentele in casa si
chiama *review gating*, ed è vietato dalle regole di Google e di Trustpilot.
Per questo in impostazioni non c'è nessuna soglia da configurare: non è una
dimenticanza.

**Una recensione non si scrive mai al posto del cliente.** Su Google non esiste
nemmeno il modo — l'API della scheda le fa leggere e rispondere, non scrivere —
e comunque sarebbe una recensione falsa: pratica commerciale scorretta, non una
scorciatoia. L'unica strada è il link, che il cliente apre col suo account.

Finché le recensioni restano nella dashboard del locale sono un suo strumento
di lavoro. Se Comanda le pubblicasse diventerebbe una piattaforma di
recensioni, con l'obbligo di dichiarare come le verifica e il divieto di
filtrare le negative: per questo restano dentro.
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
mano ai documenti gia' emessi. **PayPal** ha il suo posto pronto sul contratto
ma nessuna chiamata: li' l'incasso si segna a mano.

Il giro completo si prova con un locale finto che alla fine sparisce:

```
npx tsx scripts/prova-fatturazione.ts
```

### Incasso con carta (Stripe)

Stripe incassa il canone dai locali. **Non emette le fatture**: quelle restano
di Comanda, con la numerazione di sopra. Non e' una mancanza da colmare — in
regime forfettario la fattura elettronica passa dallo SDI, e una seconda
numerazione parallela su Stripe sarebbe solo un modo per litigare col
commercialista.

Il pezzo che vale la pena sapere prima di leggere il codice: **a Stripe si
mandano i prodotti, non i prezzi**. I prodotti sono i nomi che finiscono sulla
ricevuta e si creano una volta con `scripts/stripe-catalogo.ts`; il prezzo
invece parte ogni volta da `recurring_cents` sul contratto, costruito al volo.
Cosi' non esistono due listini da tenere allineati, e il prezzo fondatori, lo
scostamento per singolo locale e il pacchetto su misura funzionano senza casi
speciali — nessuno dei tre sta in un listino.

Il locale collega la carta da solo, dalla sua pagina Abbonamento: un bottone
che diventa "Gestisci il pagamento" appena l'abbonamento e' aperto, e da li'
si cambia la carta scaduta, si scaricano le ricevute e si disdice senza
chiamarmi — che e' anche quello che chiede la legge sui rinnovi automatici.
L'indirizzo di Stripe torna dalla server action e ci si sposta dal browser: un
`redirect()` da li' rimbalzerebbe al login, come per i dati di fatturazione.

Si paga sulla pagina di Stripe, non su una nostra: la carta non passa mai da
qui, e SCA, 3-D Secure e i rinnovi falliti li gestisce Stripe.

**Da quando si addebita** e' la regola che merita attenzione, perche' sbagliarla
vuol dire incassare due volte lo stesso mese. Collegare la carta non fa partire
il conto da oggi: parte da quando finisce il periodo gia' coperto — la fine
della prova per chi e' in prova, `next_invoice_at` per chi e' gia' attivo. Un
locale che collega la carta il 21 agosto con la scadenza al 20 settembre non
paga niente fino al 20 settembre, e su Stripe lo si legge da un totale di zero
sulla sessione. Le eccezioni sono due: chi e' sospeso paga subito perche' ha un
arretrato, e un impianto con l'attivazione ancora da incassare paga subito
perche' l'attivazione non aspetta.

L'**attivazione una tantum** entra nella stessa sessione del canone: al primo
pagamento il locale salda impianto e primo mese insieme, non con due incassi
separati per la stessa firma. Le condizioni sono due e sono solo queste: c'e'
un importo, e non e' gia' stata fatturata. **Non dipende dal modello di
contratto** — `activation_cents` si scrive a mano dal pannello, e un
abbonamento con un impianto iniziale e' un contratto normalissimo.

Salendo di piano l'impianto **segue il pacchetto**, e come si incassa dipende
da `activation_invoiced_at`: se non e' ancora stato fatturato si chiede
intero, perche' il locale non ha comprato niente; se e' gia' stato pagato si
chiede la **sola differenza**, che va in conguaglio sulla prossima fattura —
gli 890 di Base li ha gia' versati e chiedergli i 1690 di Premium sarebbe
fargli pagare due volte lo stesso impianto. La differenza si conguaglia
intera, senza dividerla per i giorni che restano: il lavoro che separa i due
impianti si fa tutto, e costa uguale a inizio o a fine mese. Scendendo di
piano non si rimborsa niente.

### Quando le due parti si devono parlare

Ogni volta che una decisione presa di qua vale anche di la', va ripetuta a
Stripe: un dato che vive in due posti e viene scritto in uno solo continua per
conto suo, e la differenza la paga il locale.

- **Prova allungata dal pannello** → `allineaProvaSuStripe`. Chi ha gia' la
  carta ha di la' una data di primo addebito congelata: regalargli trenta
  giorni solo a database vorrebbe dire vederlo pagare una prova promessa
  gratis.
- **Contratto chiuso** → `chiudiAbbonamentoSuStripe`, subito. Senza, il locale
  sparisce dai conti e la sua carta continua a essere addebitata: soldi presi
  a un cliente che non esiste piu'.
- **Il locale disdice** → lo dice Stripe a noi, con
  `customer.subscription.updated`. Una disdetta vale a fine periodo, quindi
  `deleted` arriva alla scadenza e puo' essere fra un anno: nel mezzo c'e'
  l'unica finestra per richiamarlo, e `provider_cancel_at` e' quello che la
  rende visibile nel pannello.

Disdire si fa **dalla dashboard del locale**, non solo dal portale di Stripe:
mandarlo su un altro sito per chiudere e' il genere di attrito che trasforma
una disdetta in una telefonata. Vale a fine periodo — quel periodo l'ha pagato
e continua a usarlo — e fino ad allora puo' riprendere l'abbonamento da solo.
`/api/stripe/webhook` e' l'unico punto che accetta ordini da fuori senza un
utente collegato, e per questo controlla la firma prima di qualsiasi altra
cosa. Quello che scrive e' l'incasso **al lordo**, con la data in cui Stripe
ha incassato davvero: il forfettario e' un regime per cassa e non deduce i
costi, quindi segnare il netto vorrebbe dire dichiarare meno di quanto e'
entrato.

```
npx tsx scripts/stripe-catalogo.ts      # i prodotti, una volta
npx tsx scripts/prova-stripe.ts         # il giro dell'incasso su un locale finto
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Senza `STRIPE_SECRET_KEY` la piattaforma funziona lo stesso e gli incassi si
segnano a mano, come per SMTP e Telegram.

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
- [x] **M10** — asporto e domicilio dal sito del locale
