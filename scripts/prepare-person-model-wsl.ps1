$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Output = Join-Path $ProjectRoot "modules\ag-scan-inference\android\src\main\assets\person.tflite"

$Wsl = Get-Command "wsl.exe" -ErrorAction SilentlyContinue
if (-not $Wsl) {
  Write-Host "WSL is not installed." -ForegroundColor Yellow
  Write-Host "Open PowerShell as Administrator and run:"
  Write-Host "  wsl --install -d Ubuntu-24.04"
  Write-Host "Restart Windows, open Ubuntu once, create its username/password, then rerun this script."
  throw "LiteRT export requires Linux x86_64 or macOS; native Windows export is unsupported."
}

$Distros = (& wsl.exe --list --quiet 2>$null) -join ""
if ([string]::IsNullOrWhiteSpace($Distros)) {
  Write-Host "WSL is enabled, but no Linux distribution is installed." -ForegroundColor Yellow
  Write-Host "Open PowerShell as Administrator and run:"
  Write-Host "  wsl --install -d Ubuntu-24.04"
  throw "Install and initialise Ubuntu before exporting."
}

$WslProjectRoot = (& wsl.exe wslpath -a $ProjectRoot).Trim()
if (-not $WslProjectRoot) {
  throw "Could not convert the project path for WSL: $ProjectRoot"
}

$WslScript = "$WslProjectRoot/scripts/prepare-person-model-wsl.sh"

Write-Host "Running the model export inside WSL/Linux..."
& wsl.exe bash $WslScript $WslProjectRoot
if ($LASTEXITCODE -ne 0) {
  throw "WSL model export failed. Read the Linux message immediately above."
}

if (-not (Test-Path $Output)) {
  throw "WSL completed, but person.tflite was not found at: $Output"
}

Write-Host ""
Write-Host "Offline person model is ready:" -ForegroundColor Green
Get-Item $Output | Select-Object FullName, Length, LastWriteTime
