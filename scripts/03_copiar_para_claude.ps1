# Copia (sin enlaces) los archivos de interfaz para que Claude pueda analizarlos
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$dst  = Join-Path $root 'para_claude'
Start-Transcript -Path (Join-Path $root 'logs\03_copiar.log') -Force | Out-Null
foreach ($d in @('window\Com', 'window\ENG', 'window\SPA', 'pointer', 'title', 'main')) {
  $src = Join-Path $root "extraido\US\DATA\files\$d"
  $to  = Join-Path $dst "US\$d"
  Write-Host "Copiando $d ..."
  robocopy $src $to /E /NFL /NDL /NJH /NJS /NP | Out-Null
}
$n = (Get-ChildItem $dst -Recurse -File).Count
Write-Host "Archivos copiados: $n"
Write-Host "`nLISTO. Ya puedes avisarle a Claude."
Stop-Transcript | Out-Null
Start-Sleep -Seconds 2
