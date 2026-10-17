# Pandora's Tower - Dionixu's Launcher
# Paso 7: crea los instaladores SIN el juego en <proyecto>\INSTALADORES\Windows y \Linux
#   Windows: "Instalar Pandora's Tower.exe" (motor del launcher + app del instalador) + payload
#            (launcher, Dolphin portable sin datos personales, texturas HD sin botones)
#   Linux:   un AppImage con el instalador, el launcher, el puente de mando para Linux y las texturas HD.
#            Se arma aqui mismo en Windows (no hace falta Linux). Electron para Linux se descarga una vez de GitHub
#            y se verifica con su firma SHA256 (o se reutiliza el de The Last Story si ya esta descargado).
# Nunca se copian: el juego, partidas, configuracion personal ni registros.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$proj  = Split-Path -Parent $PSScriptRoot                      # D:\Proyecto Pandoras Tower
$L     = Join-Path $proj 'launcher'
$LA    = Join-Path $L 'resources\app'
$INS   = Join-Path $proj 'instalador'
$dol   = Join-Path $proj 'Dolphin-x64'
$tex   = Join-Path $dol 'User\Load\Textures\SX3EXJ'
$bridgeLinux = Join-Path $proj 'linux\pt_bridge'
$out   = Join-Path $proj 'INSTALADORES'      # (no 'INSTALADOR': en Windows seria la misma carpeta que 'instalador', el codigo fuente)
$wDir  = Join-Path $out 'Windows'
$lDir  = Join-Path $out 'Linux'
$tmp   = Join-Path $out '_temporal'
$EV    = '44.5.1'
$ezip  = "electron-v$EV-linux-x64.zip"
$eSha  = '5BCD217611D6843ECECD6C9E9C1FCD1DA3AB066C43D8B1A9E4B44689A1FBA6F5'
$eurl  = "https://github.com/electron/electron/releases/download/v$EV/$ezip"
$appImageName = 'Instalar_Pandoras_Tower-x86_64.AppImage'

New-Item -ItemType Directory -Force -Path (Join-Path $proj 'logs') | Out-Null
try { Start-Transcript -Path (Join-Path $proj 'logs\07_instaladores.log') -Force | Out-Null } catch {}

function Fail($m) { Write-Host ''; Write-Host "ERROR: $m" -ForegroundColor Red; try { Stop-Transcript | Out-Null } catch {}; Read-Host 'Pulsa Enter para cerrar'; exit 1 }
trap { Fail ("$_  (linea " + $_.InvocationInfo.ScriptLineNumber + ")") }
function Step($m) { Write-Host ''; Write-Host "== $m" -ForegroundColor Cyan }
function RC($src, $dst, [string[]]$xd = @(), [string[]]$xf = @()) {
  $a = @($src, $dst, '/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP', '/NJH', '/NJS', '/MT:8')
  if ($xd.Count) { $a += '/XD'; $a += $xd }
  if ($xf.Count) { $a += '/XF'; $a += $xf }
  & robocopy @a | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail "robocopy fallo copiando $src (codigo $LASTEXITCODE)" }
}
function CopyF($src, $dst) {
  if (-not (Test-Path -LiteralPath $src)) { Fail "Falta $src" }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
  Copy-Item -LiteralPath $src -Destination $dst -Force
}
function Size($d) { [math]::Round(((Get-ChildItem -LiteralPath $d -Recurse -File | Measure-Object Length -Sum).Sum) / 1GB, 2) }

# ---------------------------------------------------------------- comprobaciones
Step 'Comprobando el proyecto'
$need = @(
  (Join-Path $L 'PandorasTower.exe'), (Join-Path $LA 'main.js'), (Join-Path $LA 'preload.js'), (Join-Path $LA 'package.json'), (Join-Path $LA 'bridge.ps1'),
  (Join-Path $L 'ui\index.html'), (Join-Path $L 'ui\exit.html'), (Join-Path $L 'ui\toast.html'), (Join-Path $L 'data\botones\xbox'), (Join-Path $L 'data\botones\teclado'),
  (Join-Path $INS 'app\main.js'), (Join-Path $INS 'app\preload.js'), (Join-Path $INS 'app\package.json'), (Join-Path $INS 'app\voces.js'),
  (Join-Path $INS 'app\receta_voces.json'), (Join-Path $INS 'app\ui\index.html'), (Join-Path $INS 'build\appimage.js'),
  (Join-Path $INS 'appimage\runtime-x86_64'), (Join-Path $INS 'appimage\AppRun'), (Join-Path $INS 'appimage\pandoras-tower.desktop'),
  (Join-Path $INS 'docs\INSTRUCCIONES_Windows.txt'), (Join-Path $INS 'docs\INSTRUCCIONES_Linux.txt'),
  $bridgeLinux, (Join-Path $dol 'Dolphin.exe'), (Join-Path $dol 'DolphinTool.exe'), $tex)
foreach ($f in $need) { if (-not (Test-Path -LiteralPath $f)) { Fail "Falta $f" } }
if (Get-Process -Name PandorasTower -ErrorAction SilentlyContinue) { Fail 'Cierra el launcher antes de crear los instaladores.' }
Write-Host '   todo en su sitio'

# Icono del juego en el .exe (el motor viene de The Last Story): se aplica el parche a la COPIA del instalador
function Set-GameIcon($exe) {
  $orig = '0A051D6D4B6C355F0297FB56BA2C61D0'; $good = 'DF467EBE973395CBA0AAE6F20EC4DE5B'
  $md5 = (Get-FileHash -LiteralPath $exe -Algorithm MD5).Hash
  if ($md5 -eq $good) { return 'ya tenia el icono del juego' }
  $pat = Join-Path $L 'data\icono_exe.bin'
  if ($md5 -ne $orig -or -not (Test-Path $pat)) { return 'icono sin cambiar (version de Electron distinta)' }
  $p = [IO.File]::ReadAllBytes($pat); $fs = [IO.File]::Open($exe, 'Open', 'ReadWrite')
  try { $n = [BitConverter]::ToUInt32($p, 4); $o = 8
    for ($i = 0; $i -lt $n; $i++) { $off = [BitConverter]::ToUInt32($p, $o); $len = [BitConverter]::ToUInt32($p, $o + 4); $o += 8; [void]$fs.Seek($off, 'Begin'); $fs.Write($p, $o, $len); $o += $len } }
  finally { $fs.Close() }
  if ((Get-FileHash -LiteralPath $exe -Algorithm MD5).Hash -ne $good) { Fail 'No se pudo poner el icono del juego en el instalador.' }
  return 'icono del juego aplicado'
}

# ---------------------------------------------------------------- Windows
Step "Instalador de Windows -> $wDir"
if (Test-Path $wDir) { Remove-Item -LiteralPath $wDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $wDir | Out-Null
Write-Host '   motor Electron...'
RC $L $wDir @((Join-Path $L 'resources'), (Join-Path $L 'ui'), (Join-Path $L 'data'), (Join-Path $L 'capturas')) @('*.log', '*.bak', 'icon.ico')
$wExe = Join-Path $wDir "Instalar Pandora's Tower.exe"
Rename-Item -LiteralPath (Join-Path $wDir 'PandorasTower.exe') -NewName "Instalar Pandora's Tower.exe"
Write-Host ('   ' + (Set-GameIcon $wExe))
Write-Host '   app del instalador...'
RC (Join-Path $INS 'app') (Join-Path $wDir 'resources\app')
Write-Host '   launcher...'
$pay = Join-Path $wDir 'payload'
foreach ($f in 'main.js', 'preload.js', 'package.json', 'bridge.ps1') { CopyF (Join-Path $LA $f) (Join-Path $pay "launcher\app\$f") }
RC (Join-Path $L 'ui') (Join-Path $pay 'launcher\ui')
RC (Join-Path $L 'data\botones') (Join-Path $pay 'launcher\data\botones')
Write-Host '   Dolphin portable (sin la carpeta User: ni partidas ni configuracion personal)...'
RC $dol (Join-Path $pay 'dolphin') @((Join-Path $dol 'User')) @('portable.txt')
Write-Host '   texturas HD (sin los botones: los pone el launcher)...'
RC $tex (Join-Path $pay 'textures\SX3EXJ') @((Join-Path $tex 'Botones')) @('desktop.ini', 'Thumbs.db')
$steamDir = Join-Path $proj 'steam'
if (Test-Path $steamDir) { RC $steamDir (Join-Path $pay 'steam') }   # AGREGAR_A_STEAM + arte
CopyF (Join-Path $INS 'docs\INSTRUCCIONES_Windows.txt') (Join-Path $wDir 'INSTRUCCIONES.txt')

# ---------------------------------------------------------------- Linux (AppImage)
Step "AppImage para Linux -> $lDir"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$zipCands = @((Join-Path $proj "descargas\$ezip"), "F:\The last Story Proyect\TLS Juego beta\descargas\$ezip")
$zip = $null
foreach ($z in $zipCands) {
  if ((Test-Path -LiteralPath $z) -and ((Get-FileHash -LiteralPath $z -Algorithm SHA256).Hash -eq $eSha)) { $zip = $z; break }
}
if (-not $zip) {
  $zip = Join-Path $proj "descargas\$ezip"
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $zip) | Out-Null
  Write-Host "   descargando Electron $EV para Linux (unos 120 MB, solo la primera vez)..."
  Invoke-WebRequest -UseBasicParsing -Uri $eurl -OutFile $zip
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $eSha) { Remove-Item $zip -Force; Fail 'La descarga de Electron no coincide con su firma SHA256. Vuelve a intentarlo.' }
}
Write-Host "   Electron para Linux: $zip"
$rt = Join-Path $tmp 'electron-linux'
if (Test-Path $rt) { Remove-Item -LiteralPath $rt -Recurse -Force }
Expand-Archive -LiteralPath $zip -DestinationPath $rt -Force
# app del launcher para Linux (sin el puente de Windows)
$laLinux = Join-Path $tmp 'launcher-app'
if (Test-Path $laLinux) { Remove-Item -LiteralPath $laLinux -Recurse -Force }
New-Item -ItemType Directory -Force -Path $laLinux | Out-Null
foreach ($f in 'main.js', 'preload.js', 'package.json') { CopyF (Join-Path $LA $f) (Join-Path $laLinux $f) }
CopyF $bridgeLinux (Join-Path $laLinux 'pt_bridge')

$spec = [ordered]@{
  runtime = (Join-Path $INS 'appimage\runtime-x86_64')
  out     = (Join-Path $tmp $appImageName)
  trees   = @(
    [ordered]@{ src = $rt; dst = ''; exclude = @('resources/default_app.asar'); exec = @('electron', 'chrome-sandbox', 'chrome_crashpad_handler') },
    [ordered]@{ src = (Join-Path $INS 'app'); dst = 'resources/app' },
    [ordered]@{ src = $laLinux; dst = 'payload/launcher/app'; exec = @('pt_bridge') },
    [ordered]@{ src = (Join-Path $L 'ui'); dst = 'payload/launcher/ui' },
    [ordered]@{ src = (Join-Path $L 'data\botones'); dst = 'payload/launcher/data/botones' },
    [ordered]@{ src = $tex; dst = 'payload/textures/SX3EXJ'; exclude = @('Botones') },
    [ordered]@{ src = (Join-Path $proj 'steam'); dst = 'payload/steam'; exclude = @('AGREGAR_A_STEAM.bat', 'AGREGAR_A_STEAM.ps1'); exec = @('agregar_a_steam.sh', 'agregar_a_steam.py') }
  )
  files   = @(
    [ordered]@{ src = (Join-Path $INS 'appimage\AppRun'); dst = 'AppRun'; mode = 493 },
    [ordered]@{ src = (Join-Path $INS 'appimage\pandoras-tower.desktop'); dst = 'pandoras-tower.desktop' },
    [ordered]@{ src = (Join-Path $L 'ui\assets\icon.png'); dst = 'pandoras-tower.png' },
    [ordered]@{ src = (Join-Path $L 'ui\assets\icon.png'); dst = '.DirIcon' }
  )
}
$specFile = Join-Path $tmp 'appimage.json'
[IO.File]::WriteAllText($specFile, ($spec | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
Write-Host '   armando el AppImage (comprime ~2 GB: unos minutos)...'
$logOut = Join-Path $tmp 'appimage.log'; $logErr = Join-Path $tmp 'appimage.err'
$env:ELECTRON_RUN_AS_NODE = '1'
$p = Start-Process -FilePath (Join-Path $L 'PandorasTower.exe') -ArgumentList @("`"$(Join-Path $INS 'build\appimage.js')`"", "`"$specFile`"") `
  -NoNewWindow -PassThru -RedirectStandardOutput $logOut -RedirectStandardError $logErr
$shown = ''
while (-not $p.HasExited) {
  Start-Sleep -Seconds 2
  $last = (Get-Content -LiteralPath $logOut -Tail 1 -ErrorAction SilentlyContinue)
  if ($last -and $last -ne $shown) { Write-Host "   $($last.Trim())"; $shown = $last }
}
$p.WaitForExit()
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$err = (Get-Content -LiteralPath $logErr -Raw -ErrorAction SilentlyContinue)
if (-not (Test-Path -LiteralPath $spec.out)) { Fail "No se pudo crear el AppImage. $err" }
Get-Content -LiteralPath $logOut -Tail 1
if (Test-Path $lDir) { Remove-Item -LiteralPath $lDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $lDir | Out-Null
Move-Item -LiteralPath $spec.out -Destination (Join-Path $lDir $appImageName)
CopyF (Join-Path $INS 'docs\INSTRUCCIONES_Linux.txt') (Join-Path $lDir 'INSTRUCCIONES.txt')
$sha = (Get-FileHash -LiteralPath (Join-Path $lDir $appImageName) -Algorithm SHA256).Hash
Set-Content -LiteralPath (Join-Path $lDir 'SHA256.txt') -Value "$sha  $appImageName" -Encoding ASCII
Remove-Item -LiteralPath $tmp -Recurse -Force

# ---------------------------------------------------------------- resumen
Step 'LISTO'
Write-Host "   Windows: $wDir  ($(Size $wDir) GB)" -ForegroundColor Green
Write-Host "            -> abre `"Instalar Pandora's Tower.exe`""
Write-Host "   Linux:   $lDir  ($(Size $lDir) GB)" -ForegroundColor Green
Write-Host "            -> en Linux: chmod +x $appImageName  y abrelo (doble clic o ./$appImageName)"
Write-Host '   Ninguno incluye el juego: piden las copias originales USA (SX3EXJ) y JP (SX3J01) del usuario.'
try { Stop-Transcript | Out-Null } catch {}
Start-Process explorer.exe $out
Read-Host 'Pulsa Enter para cerrar'
