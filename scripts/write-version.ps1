# Zapiše VERSION = 0.4.<git rev-list --count HEAD>
# -Next: pred komitom (count+1)
param([switch]$Next)
Set-Location (Join-Path $PSScriptRoot "..")
$count = [int](git rev-list --count HEAD)
if ($Next) { $count++ }
$ver = "0.4.$count"
Set-Content -Path VERSION -Value $ver -NoNewline
Add-Content -Path VERSION -Value ""
Set-Content -Path backend/VERSION -Value $ver -NoNewline
Add-Content -Path backend/VERSION -Value ""
Write-Host "VERSION=$ver"
