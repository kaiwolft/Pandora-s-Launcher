# Pandora's Tower - Paso 6: carpeta final portatil (launcher + Dolphin + juego), lista para moverla a donde quieras
# El juego y las texturas HD se crean como enlaces duros: es instantaneo y no ocupa espacio extra en D:.
# Si luego mueves la carpeta a otro disco, Windows copia los datos completos y sigue funcionando igual.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dst  = Join-Path (Split-Path -Parent $root) "Pandora's Tower (Dionixu's Launcher)"
Start-Transcript -Path (Join-Path $root 'logs\06_carpeta_final.log') -Force | Out-Null
function Link-Tree($src, $to, [long]$minBytes) {
  # enlaza los archivos >= minBytes y copia los pequenos (los que el launcher o Dolphin reescriben)
  $n = 0; $l = 0
  $files = Get-ChildItem -LiteralPath $src -Recurse -File -Force
  $total = $files.Count
  foreach ($f in $files) {
    $rel = $f.FullName.Substring($src.Length).TrimStart('\')
    $out = Join-Path $to $rel
    $dir = Split-Path -Parent $out
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
    $done = $false
    if ($f.Length -ge $minBytes) {
      try { New-Item -ItemType HardLink -Path $out -Target $f.FullName -ErrorAction Stop | Out-Null; $l++; $done = $true } catch {}
    }
    if (-not $done) { Copy-Item -LiteralPath $f.FullName -Destination $out -Force }
    $n++
    if ($n % 500 -eq 0) { Write-Progress -Activity $src -Status "$n / $total" -PercentComplete ($n * 100 / [math]::Max(1, $total)) }
  }
  Write-Progress -Activity $src -Completed
  Write-Host ("  {0}: {1} archivos ({2} enlazados)" -f (Split-Path -Leaf $src), $n, $l)
}
try {
  foreach ($f in @('launcher\PandorasTower.exe', 'Dolphin-x64\Dolphin.exe', 'juego\US_INGLES\DATA\sys\main.dol', 'juego\US_VOZ_JP\DATA\sys\main.dol')) {
    if (-not (Test-Path (Join-Path $root $f))) { throw "Falta $f" } }
  if (Get-Process -Name PandorasTower, Dolphin -ErrorAction SilentlyContinue) { throw 'Cierra el launcher y Dolphin antes de continuar.' }
  Write-Host "Destino: $dst`n"
  New-Item -ItemType Directory -Force -Path $dst | Out-Null

  Write-Host '=== 1. Launcher'
  robocopy (Join-Path $root 'launcher') (Join-Path $dst 'launcher') /E /XD chromium /XF launcher.log /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy launcher ($LASTEXITCODE)" }

  Write-Host '=== 2. Dolphin (config, partidas, botones)'
  $dol = Join-Path $root 'Dolphin-x64'
  robocopy $dol (Join-Path $dst 'Dolphin-x64') /E /XD (Join-Path $dol 'User\Load\Textures') (Join-Path $dol 'User\Cache') (Join-Path $dol 'User\Logs') (Join-Path $dol 'User\Dump') /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy Dolphin ($LASTEXITCODE)" }
  Write-Host '=== 3. Texturas HD'
  $tex = Join-Path $dol 'User\Load\Textures'
  if (Test-Path $tex) { Link-Tree $tex (Join-Path $dst 'Dolphin-x64\User\Load\Textures') 0 }

  Write-Host '=== 4. Juego (ingles y voces japonesas)'
  foreach ($v in @('US_INGLES', 'US_VOZ_JP')) { Link-Tree (Join-Path $root "juego\$v") (Join-Path $dst "juego\$v") 0 }

  Write-Host "`n=== 5. Accesos directos y LEEME"
  $act = @'
@echo off
set "PTROOT=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$r=$env:PTROOT.TrimEnd('\'); $l=Join-Path $r 'launcher'; $ws=New-Object -ComObject WScript.Shell; foreach($d in @((Join-Path $r 'PANDORA''S TOWER.lnk'),(Join-Path ([Environment]::GetFolderPath('Desktop')) 'Pandora''s Tower.lnk'))){ $s=$ws.CreateShortcut($d); $s.TargetPath=Join-Path $l 'PandorasTower.exe'; $s.WorkingDirectory=$l; $s.IconLocation=(Join-Path $l 'ui\assets\icon.ico')+',0'; $s.Description='Pandora''s Tower - Dionixu''s Launcher'; $s.Save() }; Write-Host 'Accesos directos actualizados.'"
pause
'@
  Set-Content -LiteralPath (Join-Path $dst 'ACTUALIZAR ACCESOS DIRECTOS.bat') -Value $act -Encoding ASCII
  $leeme = @"
PANDORA'S TOWER - DIONIXU'S LAUNCHER
====================================
Abrir el juego: PANDORA'S TOWER (acceso directo) o launcher\PandorasTower.exe

Esta carpeta es portatil: muevela a donde quieras (otro disco, otra PC).
Despues de moverla, ejecuta "ACTUALIZAR ACCESOS DIRECTOS.bat" para que el acceso
directo de esta carpeta y el del escritorio apunten a la nueva ubicacion.

Contenido
  launcher\     Launcher (ajustes en launcher\data\config.json)
  Dolphin-x64\  Dolphin portable con la configuracion, partidas guardadas y texturas HD
  juego\        US_INGLES (voces en ingles) y US_VOZ_JP (voces japonesas)

Controles en el juego: F1 o L3 + R3 = menu para volver al launcher.
"@
  Set-Content -LiteralPath (Join-Path $dst 'LEEME.txt') -Value $leeme -Encoding UTF8
  $ws = New-Object -ComObject WScript.Shell
  $lau = Join-Path $dst 'launcher'
  foreach ($d in @((Join-Path $dst "PANDORA'S TOWER.lnk"), (Join-Path ([Environment]::GetFolderPath('Desktop')) "Pandora's Tower.lnk"))) {
    $s = $ws.CreateShortcut($d); $s.TargetPath = Join-Path $lau 'PandorasTower.exe'; $s.WorkingDirectory = $lau
    $s.IconLocation = (Join-Path $lau 'ui\assets\icon.ico') + ',0'; $s.Description = "Pandora's Tower - Dionixu's Launcher"; $s.Save()
    Write-Host "  $d" }

  $size = (Get-ChildItem -LiteralPath $dst -Recurse -File -Force | Measure-Object Length -Sum).Sum
  Write-Host ("`nLISTO: {0}`nTamano total (si la copias a otro disco): {1:N1} GB" -f $dst, ($size / 1GB))
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Stop-Transcript | Out-Null
Read-Host 'Presiona Enter para cerrar'
