# Pandora's Tower - Paso 1: extraer el contenido de los discos USA y JP
$ErrorActionPreference = 'Continue'
$root  = Split-Path -Parent $PSScriptRoot             # D:\Proyecto Pandoras Tower
$tool  = Join-Path $root 'Dolphin-x64\DolphinTool.exe'
$logs  = Join-Path $root 'logs'
$out   = Join-Path $root 'extraido'
New-Item -ItemType Directory -Force -Path $logs, $out | Out-Null
Start-Transcript -Path (Join-Path $logs '01_extraer.log') -Force | Out-Null

$juegos = @(
  @{ id='US'; file=(Join-Path $root "Pandora's Tower (USA) (En,Fr,Es).rvz") },
  @{ id='JP'; file=(Join-Path $root 'Pandora no Tou - Kimi no Moto e Kaeru made (Japan).rvz') }
)

$drive = (Get-Item $root).PSDrive
Write-Host ("Espacio libre en {0}: {1:N1} GB (se necesitan ~10 GB)" -f $drive.Name, ($drive.Free/1GB))
if (-not (Test-Path $tool)) { Write-Host "ERROR: no encuentro DolphinTool.exe en $tool" }

foreach ($j in $juegos) {
  $dest = Join-Path $out $j.id
  Write-Host "`n=== $($j.id): $($j.file)"
  if (-not (Test-Path -LiteralPath $j.file)) { Write-Host "ERROR: no existe el archivo"; continue }
  & $tool header -i $j.file
  if (Test-Path (Join-Path $dest 'DATA')) { Write-Host "Ya extraido, lo salto." }
  else {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Write-Host "Extrayendo (puede tardar varios minutos)..."
    & $tool extract -i $j.file -o $dest
    Write-Host "Codigo de salida: $LASTEXITCODE"
  }
  # Inventario: ruta relativa, tamano y MD5 (para comparar voces, textos y sonidos entre versiones)
  $lista = Join-Path $logs "lista_$($j.id).tsv"
  Get-ChildItem -LiteralPath $dest -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($dest.Length + 1)
    $md5 = (Get-FileHash -LiteralPath $_.FullName -Algorithm MD5).Hash
    "{0}`t{1}`t{2}" -f $rel, $_.Length, $md5
  } | Set-Content -Path $lista -Encoding UTF8
  $n = (Get-Content $lista).Count
  Write-Host "Inventario: $n archivos -> $lista"
  Get-ChildItem -LiteralPath $dest -Recurse -File | Group-Object Extension | Sort-Object Count -Descending |
    Select-Object -First 25 | ForEach-Object { Write-Host ("  {0,-10} {1,6} archivos  {2,8:N1} MB" -f $_.Name, $_.Count, (($_.Group | Measure-Object Length -Sum).Sum/1MB)) }
}
$drive = (Get-Item $root).PSDrive
Write-Host ("`nEspacio libre restante: {0:N1} GB" -f ($drive.Free/1GB))
Write-Host "`nLISTO. Ya puedes avisarle a Claude."
Stop-Transcript | Out-Null
Read-Host "Presiona Enter para cerrar"
