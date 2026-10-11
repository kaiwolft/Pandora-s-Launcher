# Pandora's Tower - Paso 5: instalar el launcher (Electron) usando el motor del launcher de The Last Story
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$lau  = Join-Path $root 'launcher'
$tls  = 'F:\The last Story Proyect\TLS Juego beta\launcher'
Start-Transcript -Path (Join-Path $root 'logs\05_launcher.log') -Force | Out-Null
try {
  if (-not (Test-Path (Join-Path $tls 'TheLastStory.exe'))) { throw "No encuentro el launcher de The Last Story en $tls" }
  Write-Host "=== 1. Copiando el motor Electron desde $tls"
  $n = 0
  Get-ChildItem $tls -File | Where-Object { $_.Name -ne 'TheLastStory.exe' } | ForEach-Object { Copy-Item $_.FullName (Join-Path $lau $_.Name) -Force; $n++ }
  Copy-Item (Join-Path $tls 'TheLastStory.exe') (Join-Path $lau 'PandorasTower.exe') -Force
  robocopy (Join-Path $tls 'locales') (Join-Path $lau 'locales') /E /NFL /NDL /NJH /NJS /NP | Out-Null
  # resources: todo menos la app de The Last Story
  Get-ChildItem (Join-Path $tls 'resources') | Where-Object { $_.Name -ne 'app' } | ForEach-Object {
    if ($_.PSIsContainer) { robocopy $_.FullName (Join-Path $lau "resources\$($_.Name)") /E /NFL /NDL /NJH /NJS /NP | Out-Null }
    else { Copy-Item $_.FullName (Join-Path $lau "resources\$($_.Name)") -Force } }
  Write-Host "Archivos del motor: $n + PandorasTower.exe + locales"

  Write-Host "`n=== 2. Comprobando"
  foreach ($f in @('PandorasTower.exe', 'resources\app\main.js', 'resources\app\preload.js', 'resources\app\bridge.ps1', 'ui\index.html', 'ui\exit.html', 'ui\assets\icon.ico')) {
    if (-not (Test-Path (Join-Path $lau $f))) { throw "Falta: launcher\$f" } }
  foreach ($f in @('Dolphin-x64\Dolphin.exe', 'juego\US_INGLES\DATA\sys\main.dol', 'juego\US_VOZ_JP\DATA\sys\main.dol')) {
    if (Test-Path (Join-Path $root $f)) { Write-Host "  OK  $f" } else { Write-Host "  FALTA  $f" -ForegroundColor Yellow } }
  New-Item -ItemType Directory -Force -Path (Join-Path $lau 'data') | Out-Null

  Write-Host "`n=== 3. Accesos directos"
  $ws = New-Object -ComObject WScript.Shell
  foreach ($dst in @((Join-Path $root "PANDORA'S TOWER.lnk"), (Join-Path ([Environment]::GetFolderPath('Desktop')) "Pandora's Tower.lnk"))) {
    $s = $ws.CreateShortcut($dst)
    $s.TargetPath = Join-Path $lau 'PandorasTower.exe'
    $s.WorkingDirectory = $lau
    $s.IconLocation = (Join-Path $lau 'ui\assets\icon.ico') + ',0'
    $s.Description = "Pandora's Tower - Dionixu's Launcher"
    $s.Save(); Write-Host "  $dst"
  }
  Write-Host "`nLISTO. Abre el juego con el acceso directo PANDORA'S TOWER."
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Stop-Transcript | Out-Null
Read-Host "Presiona Enter para cerrar"
