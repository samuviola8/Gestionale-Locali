# Aggiornamento del server di produzione.
#
# Lo lancia il runner di GitHub Actions a ogni push su main, ma funziona anche
# a mano: e' lo stesso comando, cosi' quando qualcosa va storto si ripete a
# freddo senza dover ricostruire cosa faceva la pipeline.
#
#   powershell -ExecutionPolicy Bypass -File D:\comanda\app\scripts\deploy.ps1

param(
  # Dove sta il clone servito. Non e' la cartella di lavoro del runner: li'
  # dentro ci sono anche .env.production.local e public\uploads, che non
  # devono sparire a ogni aggiornamento.
  [string]$Repo = "D:\comanda\app",
  [string]$Servizio = "Comanda",
  [string]$Ramo = "main"
)

$ErrorActionPreference = "Stop"

function Passo($testo) {
  Write-Host ""
  Write-Host "==> $testo" -ForegroundColor Cyan
}

Set-Location $Repo
$prima = (git rev-parse HEAD).Trim()

Passo "Scarico $Ramo"
git fetch --prune origin
# reset e non pull: il server non deve avere modifiche locali da conciliare,
# e un merge a meta' lascerebbe l'installazione in uno stato illeggibile.
git reset --hard "origin/$Ramo"
$dopo = (git rev-parse HEAD).Trim()

if ($prima -eq $dopo) {
  Write-Host "Gia' aggiornato a $($dopo.Substring(0,7)), niente da fare."
  exit 0
}

Passo "Dipendenze"
npm ci

$servizioEsiste = $null -ne (Get-Service $Servizio -ErrorAction SilentlyContinue)

# Si ferma prima di toccare database e build. `next start` legge da .next
# mentre lo si ricostruisce, e una migrazione che toglie una colonna sotto al
# codice vecchio lo fa cadere: meglio mezzo minuto di fermo dichiarato che
# qualche minuto di errori a caso.
if ($servizioEsiste) {
  Passo "Fermo $Servizio"
  Stop-Service $Servizio
}

try {
  Passo "Migrazioni"
  npx drizzle-kit migrate

  Passo "Build"
  npm run build
}
catch {
  Write-Host ""
  Write-Host "AGGIORNAMENTO FALLITO. Torno a $($prima.Substring(0,7))." -ForegroundColor Red
  git reset --hard $prima
  npm ci
  npm run build
  if ($servizioEsiste) { Start-Service $Servizio }
  # Le migrazioni gia' applicate NON tornano indietro: se il guasto era li',
  # va sistemato a mano. Meglio dirlo che far finta di aver rimesso tutto a
  # posto.
  Write-Host "Codice ripristinato. Controlla lo stato del database: le migrazioni non si annullano da sole." -ForegroundColor Yellow
  throw
}

if ($servizioEsiste) {
  Passo "Riavvio $Servizio"
  Start-Service $Servizio
} else {
  Write-Host "Servizio '$Servizio' non trovato: avvialo a mano o creane uno (vedi DEPLOY.md)." -ForegroundColor Yellow
}

Passo "Fatto: $($dopo.Substring(0,7))"
