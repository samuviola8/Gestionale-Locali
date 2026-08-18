# Pubblicare Comanda

Server Windows, aggiornamento automatico a ogni push su `main`.

Schema degli indirizzi:

| Indirizzo | Cosa risponde |
|---|---|
| `comanda.samuviola.dev` | la vetrina pubblica |
| `noya-lounge.samuviola.dev` | il locale (menu, dashboard, `/login`) |
| `comanda.samuviola.dev/admin` | il super-admin |

Il sottodominio decide il locale: lo slug è quello che si sceglie creando il
locale in `/admin`. Aprire un cliente nuovo non richiede di toccare il server.

---

## 1. Sulla macchina di produzione, una volta sola

### Cosa installare

- **Node.js LTS** (22 o superiore) — `node -v` per verificare
- **Git**
- **PostgreSQL 16+**
- **NSSM** (<https://nssm.cc>) per far girare l'app come servizio Windows
- **Caddy** (<https://caddyserver.com>) come proxy HTTPS

### Database

```sql
CREATE USER comanda WITH PASSWORD 'una-password-lunga';
CREATE DATABASE comanda OWNER comanda;
```

### Il codice

```powershell
mkdir D:\comanda
git clone https://github.com/samuviola8/Gestionale-Locali.git D:\comanda\app
cd D:\comanda\app
```

Copia `.env.production.example` in `.env.production.local` e riempilo. È
l'unico file che non arriva da git e che non va perso: **fanne una copia
altrove**.

```powershell
npm ci
npx drizzle-kit migrate
npm run build
```

### Il servizio

```powershell
nssm install Comanda "C:\Program Files\nodejs\npm.cmd" "run start"
nssm set Comanda AppDirectory D:\comanda\app
nssm set Comanda AppStdout D:\comanda\log\out.log
nssm set Comanda AppStderr D:\comanda\log\err.log
nssm set Comanda Start SERVICE_AUTO_START
nssm start Comanda
```

Prova che risponda: `curl http://localhost:3000` deve restituire HTML.

---

## 2. DNS e HTTPS

Sul DNS di `samuviola.dev`, due record verso l'IP pubblico del server:

```
comanda.samuviola.dev.   A    <ip>
*.samuviola.dev.         A    <ip>
```

Il jolly serve perché ogni cliente nuovo è un sottodominio nuovo. Se non vuoi
un jolly, aggiungi un record per ogni cliente — funziona uguale, solo con un
passaggio in più a ogni attivazione.

### Caddyfile

Niente certificato jolly: Caddy chiede un certificato alla prima visita di
ciascun sottodominio, e prima di farlo domanda all'app se quel locale esiste
davvero. Senza quel controllo chiunque punti un nome al server ci brucerebbe
il limite di richieste di Let's Encrypt.

```
{
    on_demand_tls {
        ask http://localhost:3000/api/tls-check
    }
}

comanda.samuviola.dev, *.samuviola.dev {
    tls {
        on_demand
    }
    reverse_proxy localhost:3000
}
```

Caddy va anch'esso installato come servizio (`caddy.exe` ha il suo comando
`caddy service install`, oppure NSSM come sopra).

Sul firewall servono aperte solo **80** e **443**: la 3000 resta interna.

---

## 3. Aggiornamento automatico da GitHub

Il runner gira **sulla macchina di produzione**: così non serve nessuna
credenziale SSH e nessun segreto nel repository: è il server che va a
prendersi il codice.

Su GitHub: **Settings → Actions → Runners → New self-hosted runner**,
scegli Windows e segui le istruzioni. Quando chiede le etichette, aggiungi:

```
comanda
```

(oltre a `self-hosted` e `windows` che mette da solo). Installalo come
servizio quando te lo chiede, così riparte da solo al riavvio.

Poi dai al servizio del runner il permesso di gestire il servizio dell'app,
altrimenti `Stop-Service` fallisce:

```powershell
sc.exe sdset Comanda "D:(A;;RPWPCR;;;S-1-5-32-544)(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)"
```

Da qui in poi **ogni push su `main` aggiorna la produzione**: il workflow
`.github/workflows/deploy.yml` lancia `scripts/deploy.ps1`, che scarica,
installa le dipendenze, ferma il servizio, salva il database, lo migra, smista
le immagini nella cartella del loro locale, ricostruisce e riavvia.

Lo stesso script si lancia a mano quando serve:

```powershell
powershell -ExecutionPolicy Bypass -File D:\comanda\app\scripts\deploy.ps1
```

---

## Cose da sapere

**L'aggiornamento ferma il servizio per il tempo della build**, circa mezzo
minuto. È voluto: `next start` legge da `.next` mentre lo si ricostruisce, e
una migrazione che toglie una colonna sotto al codice vecchio lo fa cadere.
Meglio un fermo dichiarato che qualche minuto di errori a caso. Aggiorna a
locale chiuso.

**Prima di ogni migrazione lo script fa un dump del database**, con `pg_dump`
in formato custom, in `D:\comanda\backup-db` (fuori dal clone, che a ogni
aggiornamento viene resettato). Tiene le ultime dieci copie e butta le più
vecchie. Se `pg_dump` non si trova l'aggiornamento si ferma **prima** di
toccare il database, col servizio ancora acceso: i client Postgres devono
essere installati sul server, nel PATH oppure sotto `Program Files\PostgreSQL`.

**Le migrazioni si applicano anche quando non c'è codice nuovo.** Lo script
confronta le migrazioni scritte in `drizzle\meta\_journal.json` con quelle
registrate nel database e applica le mancanti: se un aggiornamento si è
fermato a metà, rilanciarlo rimette in pari il database senza bisogno di un
commit finto. Quando non c'è niente da fare — codice fermo e database in pari
— esce subito senza toccare nulla.

**Se la build fallisce lo script torna al commit precedente da solo**, ma le
migrazioni già applicate non si annullano: il codice torna indietro, il
database no. Per quello c'è il dump, e in coda all'errore lo script stampa il
percorso della copia e il comando `pg_restore` per rimetterla (a servizio
fermo, perché cancella e riscrive tutto).

**`public\uploads` ha una cartella per locale**, col nome dello slug:
`public\uploads\noya-lounge\`. Così ogni menu espone soltanto i propri
indirizzi, e quando un cliente se ne va la sua roba si cancella in un colpo
solo. Lo smistamento lo fa `scripts\raggruppa-uploads.ts`, che il deploy lancia
a ogni aggiornamento: sposta i file rimasti nel mucchio e riscrive gli
indirizzi nel database, e quando non c'è più niente da spostare non fa nulla.

**Le immagini sono in git**, cartelle comprese. Vuol dire che il `git reset
--hard` dell'aggiornamento rimette quelle versionate: le foto caricate in
produzione dopo l'ultimo commit non sono tracciate e restano, ma se una foto
versionata viene sostituita sul server, il primo aggiornamento la riporta a
com'era nel repo. Nel backup vanno comunque messe insieme al database.

**Da salvare regolarmente**: il dump di Postgres e la cartella
`public\uploads`. Il resto si ricostruisce da GitHub. I dump del deploy sono
solo una rete per gli aggiornamenti: stanno sulla stessa macchina, quindi non
sostituiscono un backup portato altrove.

**Il super-admin è sotto `/admin`**, raggiungibile da qualunque sottodominio.
Prima di aprire il server a internet controlla che la sua password sia solida.

**Il modulo di contatto della vetrina** spedisce via SMTP con la casella
configurata in `.env.production.local` (`SMTP_USER` / `SMTP_PASS`). Con Gmail
serve una **password per le app**, non la password dell'account: si genera da
account Google → Sicurezza → Verifica in due passaggi → Password per le app, e
si revoca da lì se finisce dove non deve. Finché quelle due variabili sono
vuote il modulo non compare e la landing mostra solo l'indirizzo da copiare.

**Le segnalazioni dello staff** nascono dal pulsante in fondo alla barra della
dashboard e si leggono da `/admin/segnalazioni`, dove si risponde: la risposta
torna nello stesso pannello, con il pallino acceso finche' qualcuno del locale
non l'ha letta. L'avviso immediato passa da un bot Telegram
(`TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`): il token lo da' @BotFather, il
chat id si legge da `https://api.telegram.org/bot<TOKEN>/getUpdates` dopo aver
scritto un messaggio al bot. Senza quelle due variabili l'avviso parte per
mail sulla casella SMTP; se non c'e' neanche quella, la segnalazione resta
comunque salvata e si vede in `/admin/segnalazioni`.

**Le conferme di prenotazione** partono invece dalla casella del *locale*, che
il titolare configura da Impostazioni → Posta del locale (anche lì serve una
password per applicazione). Quella password viene salvata cifrata, e la chiave
è `APP_SECRET` in `.env.production.local`: metti una frase lunga a caso e non
cambiarla più — cambiandola, le password già salvate diventano illeggibili e
ogni locale deve reinserire la sua. Senza `APP_SECRET` la sezione lo dice e non
salva niente.

**La stampa** funziona dai computer del locale con Chrome avviato con
`--kiosk-printing`: la pagina non stampa da sola sul server, è ogni postazione
che si prende i suoi lavori. Vedi Impostazioni → Postazione di stampa.
