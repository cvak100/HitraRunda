# HTTP smoke po deployu: health, verzija, game-config, gost.
param(
  [string]$Base = "http://localhost:5008"
)
$Base = $Base.TrimEnd("/")
Write-Host "Smoke → $Base"

$health = Invoke-RestMethod -Uri "$Base/api/health/"
if (-not $health.ok) { throw "FAIL: health ni ok" }
if (-not $health.version) { throw "FAIL: manjka version" }
Write-Host "health version=$($health.version)"

$cfg = Invoke-RestMethod -Uri "$Base/api/game-config/"
if (-not $cfg.enabled_modes) { throw "FAIL: game-config" }
if (-not $cfg.version) { throw "FAIL: game-config brez version" }

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$guestBody = @{ nickname = "Smoke bot" } | ConvertTo-Json
try {
  $null = Invoke-RestMethod -Uri "$Base/api/auth/csrf/" -WebSession $session -ErrorAction SilentlyContinue
} catch {}
$csrf = $session.Cookies.GetCookies($Base) | Where-Object { $_.Name -eq "csrftoken" } | Select-Object -First 1 -ExpandProperty Value
$headers = @{ "Content-Type" = "application/json" }
if ($csrf) {
  $headers["X-CSRFToken"] = $csrf
  $headers["Referer"] = "$Base/"
}
$guest = Invoke-RestMethod -Uri "$Base/api/auth/guest/" -Method Post -Body $guestBody -Headers $headers -WebSession $session
if (-not $guest.user) { throw "FAIL: guest" }

Write-Host "OK — smoke prešel ($Base)."
