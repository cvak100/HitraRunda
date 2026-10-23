# Enostaven produkcijski zagon: .\deploy\install.ps1 http|https
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidateSet("http", "https")]
  [string]$Mode
)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".env")) {
  if (Test-Path ".env.prod.example") {
    Copy-Item ".env.prod.example" ".env"
    Write-Host "Ustvarjena .env iz .env.prod.example — uredi gesla in APP_URL, nato znova zaženi."
    exit 1
  }
  throw "Manjka .env — kopiraj .env.prod.example v .env."
}

Get-Content ".env" | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $parts = $line -split "=", 2
  if ($parts.Count -eq 2) {
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
  }
}

$appUrl = [Environment]::GetEnvironmentVariable("APP_URL", "Process")
$pgPass = [Environment]::GetEnvironmentVariable("POSTGRES_PASSWORD", "Process")
$secret = [Environment]::GetEnvironmentVariable("DJANGO_SECRET_KEY", "Process")

if (-not $appUrl) { throw "V .env nastavi APP_URL." }
if (-not $pgPass -or -not $secret) { throw "V .env nastavi POSTGRES_PASSWORD in DJANGO_SECRET_KEY." }

if ($Mode -eq "https") {
  if (-not $appUrl.StartsWith("https://")) {
    throw "Za https način mora APP_URL začeti z https://"
  }
  $domain = [Environment]::GetEnvironmentVariable("APP_DOMAIN", "Process")
  if (-not $domain) {
    $domain = ([Uri]$appUrl).Host
    [Environment]::SetEnvironmentVariable("APP_DOMAIN", $domain, "Process")
    Write-Host "APP_DOMAIN=$domain (iz APP_URL)"
  }
  $email = [Environment]::GetEnvironmentVariable("TLS_EMAIL", "Process")
  if (-not $email) { throw "Za Let's Encrypt v .env nastavi TLS_EMAIL." }
}

$env:COMPOSE_PROFILES = $Mode
Write-Host "Zagon (profil=$Mode)…"
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

Write-Host ""
Write-Host "Pripravljeno."
if ($Mode -eq "http") {
  Write-Host "Odpri: $appUrl"
} else {
  Write-Host "Odpri: $appUrl"
  Write-Host "DNS za $([Environment]::GetEnvironmentVariable('APP_DOMAIN','Process')) mora kazati sem; porta 80/443 odprta."
}
