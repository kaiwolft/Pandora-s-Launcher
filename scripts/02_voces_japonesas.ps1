# Pandora's Tower - Paso 2: version USA con voces japonesas (y copia en ingles)
#   juego\US_INGLES  -> juego USA tal cual (enlaces duros, no ocupa espacio)
#   juego\US_VOZ_JP  -> juego USA con voces, cinematicas y lip-sync japoneses; textos en ingles/frances/espanol
$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $PSScriptRoot
$us     = Join-Path $root 'extraido\US'
$jp     = Join-Path $root 'extraido\JP'
$parche = Join-Path $root 'parches\voces_jp'
$logs   = Join-Path $root 'logs'
$en     = Join-Path $root 'juego\US_INGLES'
$vjp    = Join-Path $root 'juego\US_VOZ_JP'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
Start-Transcript -Path (Join-Path $logs '02_voces_jp.log') -Force | Out-Null
try {
Add-Type -Namespace W -Name K -MemberDefinition @'
[DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
public static extern bool CreateHardLink(string newFile, string existingFile, IntPtr sa);
'@
function Md5($p) { (Get-FileHash -LiteralPath $p -Algorithm MD5).Hash }
function Link($src, $dst) {
  $dir = Split-Path -Parent $dst
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  if (-not [W.K]::CreateHardLink($dst, $src, [IntPtr]::Zero)) { Copy-Item -LiteralPath $src -Destination $dst -Force; return $false }
  return $true
}

# ---------- 0. Comprobaciones ----------
$man = Get-Content (Join-Path $parche 'manifiesto.json') -Raw | ConvertFrom-Json
Write-Host "=== 0. Comprobando archivos"
foreach ($p in $man.files.PSObject.Properties) {
  $f = Join-Path $parche $p.Name
  if (-not (Test-Path -LiteralPath $f)) { throw "Falta el archivo del parche: $($p.Name)" }
  if ((Md5 $f) -ne $p.Value) { throw "Archivo del parche danado: $($p.Name)" }
}
$jpScene = Join-Path $jp 'DATA\files\sound\X3_STRM_SCENE.cpk'
$usScene = Join-Path $us 'DATA\files\sound\ENG\X3_STRM_SCENE.cpk'
if ((Md5 $jpScene) -ne $man.sources_md5.JP_SCENE) { throw "El disco JP no coincide con el esperado (X3_STRM_SCENE.cpk)" }
if ((Md5 $usScene) -ne $man.sources_md5.US_SCENE) { throw "El disco USA no coincide con el esperado (X3_STRM_SCENE.cpk)" }
Write-Host "Parche y discos correctos."

# ---------- 1. Copia en ingles (enlaces duros) ----------
Write-Host "`n=== 1. Version en ingles en $en"
if (Test-Path $en) { Write-Host "Ya existe, la dejo como esta." }
else {
  $n = 0
  Get-ChildItem -LiteralPath $us -Recurse -File | ForEach-Object {
    [void](Link $_.FullName (Join-Path $en $_.FullName.Substring($us.Length + 1))); $n++ }
  Write-Host "Archivos enlazados: $n"
}

# ---------- 2. Version con voces japonesas ----------
Write-Host "`n=== 2. Version con voces japonesas en $vjp"
if (Test-Path $vjp) { Write-Host "Borrando la version anterior..."; Remove-Item $vjp -Recurse -Force }
$map = @{}
Get-Content (Join-Path $parche 'reemplazos.txt') | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object {
  $t = $_.Split('|'); $map[$t[2]] = @{ tipo = $t[0]; src = $t[1]; hecho = $false } }
$c = @{ link = 0; jp = 0; parche = 0; cpk = 0; copia = 0 }
Get-ChildItem -LiteralPath $us -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($us.Length + 1)
  $dst = Join-Path $vjp $rel
  $dir = Split-Path -Parent $dst
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $m = $map[$rel]
  if ($m) {
    switch ($m.tipo) {
      'JP'     { Copy-Item -LiteralPath (Join-Path $jp $m.src) -Destination $dst -Force; $c.jp++ }
      'PARCHE' { Copy-Item -LiteralPath (Join-Path $parche $m.src) -Destination $dst -Force; $c.parche++ }
      'CPK'    {
        Write-Host "  Armando X3_STRM_SCENE.cpk (escenas: voces JP + 4 pistas de camara de la version occidental)..."
        $out = [IO.File]::Create($dst)
        $fj = [IO.File]::OpenRead($jpScene); $fu = [IO.File]::OpenRead($usScene)
        $buf = New-Object byte[] (4MB)
        $h = [IO.File]::ReadAllBytes((Join-Path $parche 'scene_cpk_head.bin')); $out.Write($h, 0, $h.Length)
        foreach ($l in Get-Content (Join-Path $parche $m.src)) {
          if (-not $l) { continue }
          $t = $l.Split(' ')
          if ($t[0] -eq 'Z') { $z = New-Object byte[] ([int]$t[1]); $out.Write($z, 0, $z.Length); continue }
          $f = if ($t[0] -eq 'J') { $fj } else { $fu }
          [void]$f.Seek([int64]$t[1], 'Begin'); $left = [int64]$t[2]
          while ($left -gt 0) { $r = $f.Read($buf, 0, [int][Math]::Min($left, $buf.Length)); if ($r -le 0) { throw "Lectura corta" }; $out.Write($buf, 0, $r); $left -= $r }
        }
        $e = [IO.File]::ReadAllBytes((Join-Path $parche 'scene_cpk_etoc.bin')); $out.Write($e, 0, $e.Length)
        $out.Close(); $fj.Close(); $fu.Close()
        if ((Md5 $dst) -ne $man.scene_cpk.md5) { throw "X3_STRM_SCENE.cpk armado con errores (MD5 distinto)" }
        Write-Host "  X3_STRM_SCENE.cpk correcto."; $c.cpk++
      }
    }
    $m.hecho = $true
  } elseif (Link $_.FullName $dst) { $c.link++ } else { $c.copia++ }
}
$faltan = @($map.GetEnumerator() | Where-Object { -not $_.Value.hecho } | ForEach-Object { $_.Key })
if ($faltan.Count) { throw ("No se aplicaron estos reemplazos: " + ($faltan -join ', ')) }
Write-Host ("Enlazados: {0} | del disco JP: {1} | del parche: {2} | CPK armado: {3} | copiados por fallo de enlace: {4}" -f $c.link, $c.jp, $c.parche, $c.cpk, $c.copia)
"voces=jp" | Set-Content (Join-Path $vjp 'listo.txt')
$drive = (Get-Item $root).PSDrive
Write-Host ("`nEspacio libre restante: {0:N1} GB" -f ($drive.Free/1GB))
Write-Host "`nLISTO. Ya puedes avisarle a Claude."
} catch {
  Write-Host "`nERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Avisale a Claude y pasale el log."
}
Stop-Transcript | Out-Null
Read-Host "Presiona Enter para cerrar"
