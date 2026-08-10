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
2. Copia `.env.example` in `.env.local`, poi `docker compose up -d` e
   `npm run db:migrate`
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
pagamenti, agent AI, fedelta). Lo stato per locale sta in `tenant_modules`; le
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

## Roadmap

- [x] **M0** — scheletro + multi-tenant + pipeline
- [x] **M1** — tenant + menu + QR (database)
- [x] **M2** — ordine cliente (carrello + alias per persona)
- [x] **M3** — coda staff in tempo reale
- [x] **M4** — pre-conto + split per il cassiere
- [x] **M5** — configurazione per locale (tema, moduli, onboarding)
- [ ] **M6** — import menu via OCR
- [ ] **M7** — pagamento Apple/Google Pay
- [ ] **M8** — agent AI consiglio drink, programma fedelta
