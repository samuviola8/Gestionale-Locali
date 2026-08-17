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
| `lib/profiles.ts` | profili di locale (lounge, pub, ristorante) |
| `lib/onboarding.ts` | creazione completa di un locale |
| `lib/table-session.ts` | sessione tavolo a scadenza |
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
