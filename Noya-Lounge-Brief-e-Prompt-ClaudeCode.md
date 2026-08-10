# Noya Lounge Bar — Brief cliente + Prompt per Claude Code

Preparato per: proposta commerciale gestionale ordini-al-tavolo via QR
Data: 09/08/2026
Fonti analizzate: sito noyalounge.it (snippet, sito blocca il fetch diretto via robots.txt), Google Maps, Facebook, Eventbrite, Registro Imprese, file recensioni Outscraper allegato (44 recensioni, rating 4,6★)

---

## 1. Executive summary

Noya Lounge Bar è un locale di nuova apertura (2025) a Sant'Agata li Battiati (CT), posizionato come lounge bar/cocktail bar elegante con proposta food, musica dal vivo ed eventi a tema. Rating altissimo (4,6★/44 recensioni) ma con due criticità ricorrenti e molto specifiche che il tuo gestionale risolve quasi "out of the box": **tempi di attesa al tavolo per ordinare** (personale sotto organico nei picchi) e **gestione del conto/pagamento** (percezione di scarsa trasparenza, difficoltà a dividere la spesa). Questo rende Noya un pitch ad altissima aderenza prodotto-problema: non stai vendendo "un gestionale in più", stai vendendo la soluzione diretta a un problema che i clienti hanno già scritto pubblicamente su Google.

---

## 2. Scheda del locale

- **Nome commerciale:** Noya Lounge Bar (ragione sociale: Noya Lounge S.r.l.s.)
- **Indirizzo locale:** Via Antonino di Sangiuliano 40/A, 95030 Sant'Agata li Battiati (CT)
- **Categoria:** Lounge bar / cocktail bar con cucina, ATECO organizzazione feste e cerimonie — quindi anche eventi privati
- **Posizionamento:** locale "diverso dal solito" nel panorama di Catania, molto fotografico, atmosfera curata, luci soffuse, musica dal vivo/DJ set, spazio ampio con parcheggio (elemento citato spesso come plus raro in zona)
- **Format ricorrenti individuati:**
  - Giovedì sera: "cena spettacolo"
  - Format eventi domenicali "GiraNoya" (aperitivo/sunset con DJ set e musica live, ticket su Eventbrite)
  - Feste private/compleanni (citate nelle recensioni)
  - Menzione di spazi stagionali ("non vedo l'ora che chiudano gli spazi per andare anche in inverno") → probabile struttura mista indoor/outdoor con copertura stagionale
- **Rating Google:** 4,6★ su 44 recensioni (dato dal file allegato, aggiornato al 09/08/2026)

---

## 3. Analisi delle 44 recensioni Google (dal file allegato)

### Punti di forza ricorrenti (tema, frequenza approssimativa)
- **Atmosfera/estetica**: locale "diverso dal solito", elegante, curato nei dettagli, luci soffuse — citato nella maggioranza delle recensioni 5★
- **Musica live/eventi**: cena spettacolo del giovedì, eventi dal vivo, DJ set citati come punto di forza distintivo
- **Qualità food & cocktail**: ingredienti freschi, piatti "cucinati sul momento", cocktail "ricercati e ben bilanciati"
- **Parcheggio**: citato più volte come plus raro per la zona — persino l'unica nota positiva nella recensione più negativa
- **Staff (quando funziona)**: "gentile", "professionale", "attento" nella maggior parte dei casi

### Criticità ricorrenti (rilevanti per il pitch del gestionale)
1. **Prezzo percepito come alto rispetto al servizio**, soprattutto sui cocktail — citato in più recensioni, anche in quelle positive ("bevande un po' care")
2. **Servizio lento/discontinuo nei picchi**: la recensione negativa più dettagliata descrive servizio "scorbutico, improvvisato e lentissimo" — coerente con quanto hai osservato di persona (personale che non tiene testa al numero di tavoli)
3. **Gestione del conto poco trasparente**: nella recensione 1★ più dettagliata, lo scontrino viene descritto come consegnato solo dopo richiesta esplicita, con sensazione di "scarsa professionalità" nella fase di pagamento — è esattamente il punto debole che il modulo sotto-conti/conto condiviso risolve
4. **Un episodio di comunicazione scortese al bancone** in fase di reclamo su un drink — indica anche un tema di formazione/staff, non solo di processo, ma un flusso ordini più strutturato (con note e customizzazioni chiare) riduce il margine di errore che genera questo tipo di attrito

**Conclusione analisi:** i due problemi che hai riscontrato personalmente (attesa e conto) non sono percezioni isolate: sono gli stessi due temi che emergono nella recensione negativa più dettagliata del locale. Questo è l'argomento commerciale più forte che hai a disposizione.

---

## 4. Direzione di stile per la UI personalizzata (branding cliente)

Non essendo riuscito ad accedere al sito (noyalounge.it blocca il fetch automatico via robots.txt — consiglio di aprirlo manualmente da browser e fare screenshot di palette/logo/font prima di lanciare Claude Code, oppure autorizzarmi a fare uno screenshot in un altro modo se preferisci), la direzione stilistica va confermata sul sito reale. In base a posizionamento, categoria e immaginario ricorrente nelle recensioni (lounge, luci soffuse, atmosfera "serale/elegante", eventi musicali), la palette plausibile è:

- **Palette:** toni scuri/notturni (nero, blu notte o verde bottiglia) con accento caldo (oro/rame/ottone) — estetica lounge/cocktail bar da confermare col logo reale
- **Tipografia:** un serif/display elegante per titoli ed eventi, sans-serif pulito per menu e prezzi (leggibilità su smartphone in ambiente con poca luce)
- **Tono di voce:** curato, un po' esclusivo, orientato all'esperienza serale ("aperitivo", "notte", "evento") più che al fast-food
- **Attenzione UX specifica:** essendo un locale con luci soffuse la sera, la web app cliente deve avere un **tema scuro leggibile al buio** come default (alto contrasto, niente sfondi bianchi accecanti), con font abbastanza grandi per essere letti anche dopo un paio di drink

---

## 5. Come il gestionale risponde punto per punto ai problemi rilevati

| Problema rilevato (recensioni + esperienza diretta) | Modulo del gestionale che lo risolve |
|---|---|
| Attesa lunga per ordinare, staff sotto organico nei picchi | Ordinazione self-service da smartphone via QR al tavolo, senza aspettare il cameriere |
| Conto poco trasparente / difficoltà a dividere la spesa | Apertura tavolo con sotto-conti al momento dell'ordine + conti condivisi solo tra alcune persone selezionate |
| Prezzo percepito alto sui cocktail, poca guida nella scelta | Agent AI opzionale (abbonamento mensile) che consiglia cocktail/drink in base a gusti e budget, gestibile con sconti mirati per aumentare il valore percepito |
| Voglia di "tornare" espressa in molte recensioni positive | Programma fedeltà con sconti/consumazioni omaggio per i clienti ricorrenti |
| Eventi ricorrenti (giovedì cena spettacolo, GiraNoya domenicale) | Possibilità di menu/servizio differenziato per fascia oraria o evento (serve confermare se il gestionale supporta già "menu per evento/fascia oraria" o va aggiunto come feature del setup cliente) |

---

## 6. Cosa manca per completare il setup (da recuperare prima o durante l'onboarding col cliente)

- **Menu reale** (piatti, cocktail, prezzi, categorie, eventuali menu per evento/giovedì) — non accessibile via fetch automatico, va richiesto al locale o fotografato di persona
- **Logo in alta risoluzione e font ufficiali del brand**
- **Planimetria/numero tavoli** e eventuale distinzione zone (es. area lounge, area cena spettacolo, dehors stagionale)
- **Referente locale** per test e formazione staff al lancio

---

## 7. Nota architetturale — leggi prima del prompt

Hai confermato che: l'architettura non è ancora decisa, il theming è tutto da costruire, e i moduli agent AI/fedeltà vanno progettati da zero. In pratica **Noya Lounge Bar non è "un cliente da aggiungere": è il primo caso reale che userai per progettare l'architettura multi-cliente del gestionale.**

Questo cambia l'approccio giusto per il prompt:
- Non ha senso chiedere a Claude Code di "istanziare un cliente da un sistema esistente", perché il sistema per gestire più clienti non esiste ancora.
- Ha molto senso, invece, chiedergli di **progettare fin da subito un'architettura multi-tenant** (un'unica codebase/DB con clienti distinti da record) piuttosto che multi-istanza. Il motivo: il tuo obiettivo di business è vendere lo stesso gestionale a più locali, quindi ogni nuovo cliente in futuro deve poter essere aggiunto configurando dati (branding, menu, moduli attivi), non clonando codice. La multi-istanza diventerebbe insostenibile da mantenere già dal terzo/quarto cliente.
- Il theming, i moduli fedeltà e l'agent AI vanno costruiti come **sistemi generici configurabili per tenant**, usando Noya solo come primo caso concreto per popolarli — non come funzionalità hardcoded per Noya.

Il prompt qui sotto riflette questo: chiede prima l'architettura di base, poi la configurazione concreta di Noya sopra quell'architettura.

---

## 8. Prompt operativo da incollare in Claude Code

```
Sto costruendo un gestionale server-client per locali (bar, lounge, ristoranti):
i clienti aprono il tavolo scansionando un QR code e ordinano direttamente dal
proprio smartphone. Ho già un primo prototipo funzionante, ma NON ho ancora
un'architettura multi-cliente: finora ho lavorato su un solo locale di test.

Sant'Agata li Battiati (CT) è il mio primo cliente commerciale reale: Noya
Lounge Bar. Voglio usare questo caso concreto per costruire subito
un'architettura multi-tenant corretta, invece di continuare a lavorare come se
esistesse un solo locale.

FASE 1 — ARCHITETTURA MULTI-TENANT (prerequisito, da fare prima di tutto)
Prima di configurare Noya, valuta lo stato attuale del codebase e proponimi
(chiedendomi conferma prima di implementare cambi strutturali importanti):
1. Un modello dati "tenant/locale" (nome, slug, indirizzo, tavoli, QR associati,
   menu, moduli attivi, tema/branding) che permetta di aggiungere nuovi clienti
   in futuro configurando dati, non duplicando codice o deploy.
2. Un sistema di THEMING per tenant: colori, font, logo, dark/light mode di
   default, configurabile per singolo locale (es. record di configurazione in DB
   o file di tema per tenant — proponimi tu l'opzione più coerente con lo stack
   che sto già usando).
3. Un sistema di FEATURE FLAG per modulo, per tenant: ordinazione da QR,
   sotto-conti/conto condiviso, modulo pagamento Apple/Google Pay (in sviluppo
   separato, va predisposto come flag disattivabile), modulo Agent AI di
   consiglio cocktail (add-on ad abbonamento mensile), modulo programma fedeltà
   (sconti/consumazioni omaggio per clienti ricorrenti). Ogni modulo deve poter
   essere acceso/spento per singolo tenant indipendentemente dagli altri.
4. Non toccare/rompere il locale di test attuale: se già esiste dati per un solo
   locale, va migrato a diventare il "tenant 0" di questa nuova struttura.

Prima di scrivere codice per il punto 1-3, dimmi che approccio proponi e
aspetta la mia conferma.

FASE 2 — CONFIGURAZIONE DEL PRIMO TENANT REALE: NOYA LOUNGE BAR
Una volta pronta l'architettura, crea il tenant "Noya Lounge Bar" con questi dati:

CONTESTO CLIENTE
- Nome: Noya Lounge Bar (ragione sociale Noya Lounge S.r.l.s.)
- Indirizzo: Via Antonino di Sangiuliano 40/A, 95030 Sant'Agata li Battiati (CT)
- Categoria: lounge bar / cocktail bar con cucina, locale serale, musica dal vivo,
  eventi a tema (cena spettacolo il giovedì, evento domenicale "GiraNoya" con DJ
  set), disponibilità feste private. Rating Google attuale: 4,6/5 su 44 recensioni.
- Posizionamento: elegante, curato, atmosfera "lounge notturna", target clientela
  adulta/giovane-adulta, prezzo medio-alto percepito sui cocktail.

BRANDING (interfaccia web app cliente, quella aperta via QR al tavolo)
- Tema SCURO come default (locale con luci soffuse, deve restare leggibile la sera)
- Palette: [[DA CONFERMARE DAL LOGO REALE — ipotesi di partenza: nero/blu notte +
  accento oro/rame, tipica estetica lounge]]
- Font: [[DA CONFERMARE — ipotesi: display elegante per titoli/nomi evento,
  sans-serif leggibile per menu e prezzi]]
- Logo: [[INSERIRE FILE LOGO QUI quando disponibile]]
- Usa questi come valori facilmente sostituibili nel sistema di theming appena
  costruito, non hardcoded nel markup

MENU
- Categorie plausibili: [[cocktail signature / mocktail / vini / birre / food —
  DA CONFERMARE col menu reale, non ancora ottenuto dal locale]]
- Predisponi la struttura dati pronta per l'import ma senza inventare piatti o
  prezzi reali: lasciala vuota/segnaposto finché non arriva il menu vero

MODULI DA ATTIVARE PER QUESTO TENANT
- Ordinazione da QR al tavolo: ATTIVO (core, risolve il problema di attesa nei
  picchi di sala rilevato nelle recensioni del locale)
- Sotto-conti al momento dell'ordinazione + conto condiviso limitato a un
  sottoinsieme di commensali: ATTIVO (risolve il problema di gestione/
  trasparenza del conto rilevato nelle recensioni del locale)
- Modulo pagamento Apple/Google Pay: predisposto ma DISATTIVATO (in sviluppo
  separato)
- Modulo Agent AI consiglio cocktail: predisposto ma DISATTIVATO di default
  (si attiva solo se il cliente sottoscrive l'add-on mensile)
- Modulo programma fedeltà: predisposto ma DISATTIVATO di default (si attiva
  su richiesta del locale)

LINGUA
Italiano come lingua primaria dell'interfaccia.

COSA VOGLIO DA TE ALLA FINE
Un riepilogo di: (a) le decisioni architetturali prese in Fase 1 e perché,
(b) cosa è stato configurato per Noya, (c) l'elenco preciso di informazioni
ancora mancanti (menu reale, logo, planimetria tavoli/numero QR necessari) che
mi servono dal cliente prima del go-live.
```

---

## 9. Cosa manca comunque prima del go-live con Noya

Indipendentemente dall'architettura, per completare davvero il tenant servono ancora questi dati dal locale (non recuperabili automaticamente: il sito noyalounge.it blocca il fetch automatico via robots.txt):

- **Menu reale** (piatti, cocktail, prezzi, categorie, eventuali menu per evento/giovedì)
- **Logo in alta risoluzione e font ufficiali del brand**
- **Planimetria/numero tavoli** e eventuale distinzione zone (area lounge, area cena spettacolo, dehors stagionale)
- **Referente locale** per test e formazione staff al lancio

---

## 10. Sulla mail al cliente: quando inviarla

**Raccomandazione:** non inviarla ora. Meglio prepararne solo una bozza/scaletta adesso (sotto) e scrivere la versione definitiva **dopo** aver fatto sviluppare da Claude Code una demo funzionante con l'interfaccia già personalizzata su Noya Lounge Bar. Il motivo è semplice: il tuo argomento di vendita più forte è "guarda, ho già costruito la tua interfaccia e risolve esattamente i due problemi che i tuoi clienti hanno scritto su Google" — questo funziona molto meglio se alleghi un link a una demo reale piuttosto che una descrizione a parole. Una mail "a freddo" senza demo rischia di essere trattata come una mail commerciale generica.

### Scaletta della mail (da rifinire quando la demo è pronta)
- Apertura: ti ho scoperto da cliente, non da fornitore ("sono stato personalmente da voi...")
- Osservazione specifica e concreta: attesa per ordinare + gestione conto, con riferimento (senza citare testualmente) al fatto che è un tema che emerge anche nelle recensioni Google del locale
- Presentazione sintetica del gestionale come soluzione mirata a questi due problemi, non come "l'ennesimo software"
- Link/allegato alla demo personalizzata con branding Noya Lounge Bar già pronta
- Menzione soft degli altri moduli (agent AI consigli cocktail, programma fedeltà) come opportunità di crescita, non come vendita forzata in questa prima mail
- Call to action leggera: proposta di una demo dal vivo di 15-20 minuti, non una richiesta di firma immediata

Fammi sapere quando la demo è pronta (o anche prima, se preferisci) e ti scrivo il testo completo e definitivo della mail.
