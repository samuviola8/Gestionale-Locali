# Aggiornamento del server di produzione.
#
# Lo lancia il runner di GitHub Actions a ogni push su main, ma funziona anche
# a mano: e' lo stesso comando, cosi' quando qualcosa va storto si ripete a
# freddo senza dover ricostruire cosa faceva la pipeline.
#
#   powershell -ExecutionPolicy Bypass -File D:\comanda\app\scripts\deploy.ps1
#
# Le migrazioni si applicano a ogni giro, anche quando il codice non e'
# cambiato: se un aggiornamento precedente si e' fermato a meta' il database
# resta indietro, e nessun commit nuovo lo rimetterebbe in pari da solo. Prima
# di toccarlo si scrive un dump: le migrazioni non si annullano, quindi
# l'unico modo di tornare davvero indietro e' avere la copia di prima.

param(
  # Dove sta il clone servito. Non e' la cartella di lavoro del runner: li'
  # dentro ci sono anche .env.production.local e public\uploads, che non
  # devono sparire a ogni aggiornamento.
  [string]$Repo = "c:\Users\Samuele Viola\Documents\Progetti\Gestionale-Locali",
  [string]$Servizio = "Comanda",
  [string]$Ramo = "main",
  # I dump stanno fuori dal clone: dentro, il `git reset --hard` di ogni
  # aggiornamento se li porterebbe via, e comunque non devono finire in git.
  [string]$Backup = (Join-Path (Split-Path $Repo -Parent) "backup-db"),
  [int]$BackupDaTenere = 10
)

$ErrorActionPreference = "Stop"

function Passo($testo) {
  Write-Host ""
  Write-Host "==> $testo" -ForegroundColor Cyan
}

# npm, npx e pg_dump sono programmi esterni: se falliscono, PowerShell tira
# dritto lo stesso perche' $ErrorActionPreference non li guarda. Senza questo
# controllo una build fallita passerebbe per riuscita e il try/catch qui sotto
# non annullerebbe niente.
function Esegui($descrizione, [scriptblock]$comando) {
  & $comando
  if ($LASTEXITCODE -ne 0) {
    throw "$descrizione e' uscito con codice $LASTEXITCODE"
  }
}

# pg_dump e psql di solito non sono nel PATH: l'installatore di Postgres su
# Windows lascia tutto sotto Program Files senza aggiungerceli.
function Trova-Strumento($nome) {
  $inPath = Get-Command $nome -ErrorAction SilentlyContinue
  if ($inPath) { return $inPath.Source }
  $candidati = @(
    Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\$nome.exe" -ErrorAction SilentlyContinue
    Get-ChildItem "${env:ProgramFiles(x86)}\PostgreSQL\*\bin\$nome.exe" -ErrorAction SilentlyContinue
  )
  if ($candidati.Count -gt 0) {
    # La cartella e' il numero di versione: l'ultima in ordine e' la piu' recente.
    return ($candidati | Sort-Object FullName -Descending | Select-Object -First 1).FullName
  }
  return $null
}

# Sul server la connessione sta in .env.production.local, che drizzle-kit da
# solo non legge (il suo config carica .env.local). La si ricava qui una volta
# e la si passa per ambiente, cosi' backup e migrazioni guardano di sicuro lo
# stesso database.
function Leggi-DatabaseUrl {
  if ($env:DATABASE_URL) { return $env:DATABASE_URL }
  foreach ($nome in @("C:\Users\Samuele Viola\Documents\Progetti\Gestionale-Locali\.env.production.local", ".env.local")) {
    $file = Join-Path $Repo $nome
    if (-not (Test-Path $file)) { continue }
    foreach ($riga in Get-Content $file) {
      if ($riga -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
        return $Matches[1].Trim('"').Trim("'")
      }
    }
  }
  return $null
}

# Quante migrazioni scritte non risultano ancora applicate. Serve solo a
# decidere se c'e' qualcosa da fare, e quindi se fare il dump: ad applicarle ci
# pensa drizzle-kit, che il conto vero lo tiene lui.
function Conta-MigrazioniPendenti($url, $psql) {
  $journal = Join-Path $Repo "drizzle\meta\_journal.json"
  $scritte = @((Get-Content $journal -Raw | ConvertFrom-Json).entries).Count

  # Senza psql non si puo' sapere: si assume il caso peggiore, cioe' backup e
  # migrazione. Costa un dump in piu', mai un dump in meno.
  if (-not $psql) { return $scritte }

  $tabella = (& $psql $url -t -A -c "select to_regclass('drizzle.__drizzle_migrations') is not null") | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0) { return $scritte }
  # Tabella assente: database mai migrato, sono tutte da applicare.
  if ("$tabella".Trim() -ne "t") { return $scritte }

  $applicate = (& $psql $url -t -A -c "select count(*) from drizzle.__drizzle_migrations") | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0) { return $scritte }

  $pendenti = $scritte - [int]"$applicate".Trim()
  if ($pendenti -lt 0) { return 0 }
  return $pendenti
}

function Salva-Database($url, $pgdump) {
  if (-not (Test-Path $Backup)) { New-Item -ItemType Directory -Path $Backup | Out-Null }
  $file = Join-Path $Backup ("comanda-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".dump")

  # Formato custom: compresso, e si rimette con pg_restore anche solo in parte.
  Esegui "pg_dump" { & $pgdump --format=custom --no-owner --file=$file --dbname=$url }
  if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
    throw "Il dump $file e' vuoto: non proseguo senza una copia buona."
  }
  Write-Host ("Copia: {0} ({1:N1} MB)" -f $file, ((Get-Item $file).Length / 1MB))

  # I piu' vecchi si buttano. Il nome comincia con la data, quindi l'ordine
  # alfabetico e' gia' quello cronologico.
  Get-ChildItem $Backup -Filter "comanda-*.dump" |
    Sort-Object Name -Descending |
    Select-Object -Skip $BackupDaTenere |
    Remove-Item -Force

  return $file
}

Set-Location $Repo
$prima = (git rev-parse HEAD).Trim()

Passo "Scarico $Ramo"
git fetch --prune origin
# reset e non pull: il server non deve avere modifiche locali da conciliare,
# e un merge a meta' lascerebbe l'installazione in uno stato illeggibile.
git reset --hard "origin/$Ramo"
$dopo = (git rev-parse HEAD).Trim()
$codiceNuovo = $prima -ne $dopo

Passo "Controllo il database"
$url = Leggi-DatabaseUrl
if (-not $url) {
  throw "DATABASE_URL non trovata, ne' nell'ambiente ne' in .env.production.local: senza, non posso ne' salvare ne' migrare."
}
# Cosi' `drizzle-kit migrate` la trova comunque, qualunque .env legga il config.
$env:DATABASE_URL = $url

$psql = Trova-Strumento "psql"
$pgdump = Trova-Strumento "pg_dump"
$pendenti = Conta-MigrazioniPendenti $url $psql
Write-Host "Migrazioni da applicare: $pendenti"

if (-not $codiceNuovo -and $pendenti -eq 0) {
  Write-Host "Gia' aggiornato a $($dopo.Substring(0,7)), database in pari: niente da fare."
  exit 0
}

# Meglio accorgersene adesso, col servizio ancora in piedi e il database
# ancora intatto, che a meta' aggiornamento.
if ($pendenti -gt 0 -and -not $pgdump) {
  throw "pg_dump non trovato: senza backup non tocco il database. Installa i client Postgres o mettili nel PATH."
}

if ($codiceNuovo) {
  Passo "Dipendenze"
  Esegui "npm ci" { npm ci }
}

$servizioEsiste = $null -ne (Get-Service $Servizio -ErrorAction SilentlyContinue)

# Si ferma prima di toccare database e build. `next start` legge da .next
# mentre lo si ricostruisce, e una migrazione che toglie una colonna sotto al
# codice vecchio lo fa cadere: meglio mezzo minuto di fermo dichiarato che
# qualche minuto di errori a caso. A servizio fermo anche il dump e' coerente,
# perche' nessuno sta scrivendo.
if ($servizioEsiste) {
  Passo "Fermo $Servizio"
  Stop-Service $Servizio
}

$copia = $null

try {
  if ($pendenti -gt 0) {
    Passo "Backup del database"
    $copia = Salva-Database $url $pgdump

    Passo "Migrazioni ($pendenti)"
    Esegui "drizzle-kit migrate" { npx drizzle-kit migrate }
  } else {
    Passo "Migrazioni"
    Write-Host "Database gia' in pari: niente da migrare, niente da salvare."
  }

  # Le immagini caricate prima di questo cambio stanno tutte in public\uploads
  # alla rinfusa: questo le smista nella cartella del loro locale e riscrive
  # gli indirizzi nel database. A regime non trova niente da fare e stampa
  # "Spostati 0", quindi puo' restare qui a ogni aggiornamento.
  #
  # Sta dentro il try perche' se fallisce l'aggiornamento va fermato, ma non
  # e' un passo da annullare: se la build cade dopo, il codice vecchio continua
  # a mostrare le foto agli indirizzi nuovi, che legge dal database senza
  # sapere che forma abbiano.
  Passo "Immagini per locale"
  Esegui "raggruppa-uploads" { npx tsx scripts/raggruppa-uploads.ts }

  if ($codiceNuovo) {
    Passo "Build"
    Esegui "npm run build" { npm run build }
  }
}
catch {
  Write-Host ""
  Write-Host "AGGIORNAMENTO FALLITO." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  if ($codiceNuovo) {
    Write-Host "Torno a $($prima.Substring(0,7))." -ForegroundColor Red
    git reset --hard $prima
    npm ci
    npm run build
  }
  if ($servizioEsiste) { Start-Service $Servizio }

  # Le migrazioni gia' applicate NON tornano indietro da sole: il codice si
  # rimette com'era, il database no. Per questo c'e' il dump, ed e' qui che
  # serve sapere dove sta.
  if ($copia) {
    Write-Host ""
    Write-Host "Il database e' stato migrato. La copia di prima e': $copia" -ForegroundColor Yellow
    Write-Host "Per rimetterla, a servizio fermo (cancella e riscrive tutto):" -ForegroundColor Yellow
    Write-Host "  pg_restore --clean --if-exists --no-owner --dbname=<DATABASE_URL> `"$copia`"" -ForegroundColor Yellow
  } else {
    Write-Host "Il database non e' stato toccato." -ForegroundColor Yellow
  }
  throw
}

if ($servizioEsiste) {
  Passo "Riavvio $Servizio"
  Start-Service $Servizio
} else {
  Write-Host "Servizio '$Servizio' non trovato: avvialo a mano o creane uno (vedi DEPLOY.md)." -ForegroundColor Yellow
}

Passo "Fatto: $($dopo.Substring(0,7))"
