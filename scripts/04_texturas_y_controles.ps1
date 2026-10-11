# Pandora's Tower - Paso 4: texturas HD + botones (Xbox Series X o teclado) y controles de Dolphin
param([string]$Pack = 'xbox')
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dol  = Join-Path $root 'Dolphin-x64'
$user = Join-Path $dol 'User'
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
Start-Transcript -Path (Join-Path $logs '04_texturas.log') -Force | Out-Null
try {
  # Dolphin portable: toda su configuracion queda en Dolphin-x64\User
  $pt = Join-Path $dol 'portable.txt'
  if (-not (Test-Path $pt)) { New-Item -ItemType File -Path $pt | Out-Null; Write-Host "Dolphin en modo portable (portable.txt creado)." }

  # ---------- 1. Paquete HD ----------
  $hd  = Join-Path $root 'SX3EXJ\SX3EXJ'
  $tex = Join-Path $user 'Load\Textures\SX3EXJ'
  Write-Host "=== 1. Texturas HD en $tex"
  if (Test-Path $tex) { Remove-Item $tex -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $tex | Out-Null
  $n = 0
  Get-ChildItem -LiteralPath $hd -Recurse -File | Where-Object { $_.Name -notmatch '\(' -and $_.Name -ne 'desktop.ini' -and $_.Name -ne 'Thumbs.db' } | ForEach-Object {
    $dst = Join-Path $tex $_.FullName.Substring($hd.Length + 1)
    $dir = Split-Path -Parent $dst
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Copy-Item -LiteralPath $_.FullName -Destination $dst; $n++
  }
  Write-Host "Texturas HD copiadas: $n"

  # ---------- 2. Botones ----------
  $src = Join-Path $root "launcher\data\botones\$Pack"
  if (-not (Test-Path $src)) { throw "No existe el paquete de botones: $src" }
  $bot = Join-Path $tex 'Botones'
  New-Item -ItemType Directory -Force -Path $bot | Out-Null
  $names = @{}; Get-ChildItem $src -File -Filter '*.png' | ForEach-Object { $names[$_.Name] = $true }
  Get-ChildItem $tex -Recurse -File | Where-Object { $names.ContainsKey($_.Name) } | ForEach-Object {
    Write-Host "  Sustituido (version PlayStation del paquete HD): $($_.FullName.Substring($tex.Length+1))"; Remove-Item $_.FullName }
  Copy-Item (Join-Path $src '*.png') $bot
  Write-Host ("Botones instalados ({0}): {1}" -f $Pack, $names.Count)

  # ---------- 3. Configuracion ----------
  Write-Host "`n=== 3. Configuracion de Dolphin"
  $cfg = Join-Path $user 'Config'
  New-Item -ItemType Directory -Force -Path $cfg | Out-Null
@'
[Settings]
HiresTextures = True
CacheHiresTextures = True
InternalResolution = 3
ShaderCompilationMode = 2
WaitForShadersBeforeStarting = True
[Hardware]
VSync = True
'@ | Set-Content (Join-Path $cfg 'GFX.ini') -Encoding ASCII
  # Mando clasico emulado. Mando Xbox con la POSICION de Nintendo (a = boton derecho = B de Xbox)
  # y al mismo tiempo teclado y raton (los mismos que muestran los iconos de teclado).
  $K = 'DInput/0/Keyboard Mouse'
  function kb($n) { return '`' + $K + ':' + $n + '`' }
  $m = '0.06'
@"
[Wiimote1]
Device = XInput/0/Gamepad
Extension = Classic
Classic/Buttons/A = ``Button B`` | $(kb 'Click 0') | $(kb 'RETURN')
Classic/Buttons/B = ``Button A`` | $(kb 'SPACE') | $(kb 'BACK')
Classic/Buttons/X = ``Button Y`` | $(kb 'E')
Classic/Buttons/Y = ``Button X`` | $(kb 'Q')
Classic/Buttons/ZL = ``Shoulder L`` | $(kb 'LCONTROL')
Classic/Buttons/ZR = ``Shoulder R`` | $(kb 'Click 1')
Classic/Buttons/+ = ``Start`` | $(kb 'ESCAPE')
Classic/Buttons/- = ``Back`` | $(kb 'TAB')
Classic/Triggers/L = ``Trigger L`` | $(kb 'LSHIFT')
Classic/Triggers/R = ``Trigger R`` | $(kb 'F')
Classic/Triggers/L-Analog = ``Trigger L`` | $(kb 'LSHIFT')
Classic/Triggers/R-Analog = ``Trigger R`` | $(kb 'F')
Classic/D-Pad/Up = ``Pad N`` | $(kb 'UP')
Classic/D-Pad/Down = ``Pad S`` | $(kb 'DOWN')
Classic/D-Pad/Left = ``Pad W`` | $(kb 'LEFT')
Classic/D-Pad/Right = ``Pad E`` | $(kb 'RIGHT')
Classic/Left Stick/Up = deadzone(``Left Y+``, 0.15) | $(kb 'W')
Classic/Left Stick/Down = deadzone(``Left Y-``, 0.15) | $(kb 'S')
Classic/Left Stick/Left = deadzone(``Left X-``, 0.15) | $(kb 'A')
Classic/Left Stick/Right = deadzone(``Left X+``, 0.15) | $(kb 'D')
Classic/Left Stick/Dead Zone = 0.
Classic/Right Stick/Up = deadzone(``Right Y+``, 0.15) | ``$($K):RelativeMouse Y-`` * $m
Classic/Right Stick/Down = deadzone(``Right Y-``, 0.15) | ``$($K):RelativeMouse Y+`` * $m
Classic/Right Stick/Left = deadzone(``Right X-``, 0.15) | ``$($K):RelativeMouse X-`` * $m
Classic/Right Stick/Right = deadzone(``Right X+``, 0.15) | ``$($K):RelativeMouse X+`` * $m
Classic/Right Stick/Dead Zone = 0.
Source = 1
[Wiimote2]
Source = 0
[Wiimote3]
Source = 0
[Wiimote4]
Source = 0
[BalanceBoard]
Source = 0
"@ | Set-Content (Join-Path $cfg 'WiimoteNew.ini') -Encoding ASCII
  # Esc ya no detiene el juego (ahora es el boton + / menu); solo Alt+Enter y F9
@"
[Hotkeys]
Device = $K
General/Toggle Fullscreen = @(Alt+RETURN)
General/Take Screenshot = F9
"@ | Set-Content (Join-Path $cfg 'Hotkeys.ini') -Encoding ASCII
  Write-Host "GFX.ini, WiimoteNew.ini y Hotkeys.ini escritos."
  Write-Host "`nLISTO. Ya puedes avisarle a Claude."
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
}
Stop-Transcript | Out-Null
Read-Host "Presiona Enter para cerrar"
