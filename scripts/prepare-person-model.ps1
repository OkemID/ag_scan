$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Venv = Join-Path $ProjectRoot ".model-venv"
$VenvPython = Join-Path $Venv "Scripts\python.exe"
$Model = Join-Path $ProjectRoot "model-source\yolo11n.pt"
$Output = Join-Path $ProjectRoot "modules\ag-scan-inference\android\src\main\assets\person.tflite"
$Exporter = Join-Path $PSScriptRoot "export_person_model.py"

function Get-DirectPython {
  foreach ($CommandName in @("python", "python3", "python3.12", "python3.11", "python3.10")) {
    $Command = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (-not $Command) {
      continue
    }

    try {
      $Version = & $Command.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
      if ($LASTEXITCODE -eq 0 -and $Version -in @("3.10", "3.11", "3.12")) {
        return @{
          Executable = $Command.Source
          PrefixArgs = @()
          Version = $Version
        }
      }
    }
    catch {
      # Ignore Windows Store aliases or broken installations and continue.
    }
  }

  return $null
}

function Get-PythonLauncher {
  $Launcher = Get-Command "py" -ErrorAction SilentlyContinue
  if (-not $Launcher) {
    return $null
  }

  foreach ($Version in @("3.12", "3.11", "3.10")) {
    try {
      & $Launcher.Source "-$Version" -c "import sys; print(sys.version)" *> $null
      if ($LASTEXITCODE -eq 0) {
        return @{
          Executable = $Launcher.Source
          PrefixArgs = @("-$Version")
          Version = $Version
        }
      }
    }
    catch {
      # Try the next installed Python version.
    }
  }

  return $null
}

if (-not (Test-Path $Model)) {
  throw "Missing source model: $Model"
}

if (-not (Test-Path $VenvPython)) {
  Write-Host "Creating Python environment..."

  $SelectedPython = Get-PythonLauncher
  if (-not $SelectedPython) {
    $SelectedPython = Get-DirectPython
  }

  if (-not $SelectedPython) {
    Write-Host ""
    Write-Host "Python 3.10, 3.11, or 3.12 was not found." -ForegroundColor Yellow
    Write-Host "Install Python 3.12 from python.org and enable 'Add python.exe to PATH'."
    Write-Host "Then close PowerShell, open it again, and rerun this script."
    throw "A supported Python installation is required."
  }

  Write-Host "Using Python $($SelectedPython.Version): $($SelectedPython.Executable)"
  & $SelectedPython.Executable @($SelectedPython.PrefixArgs) -m venv $Venv

  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $VenvPython)) {
    throw "Python was found, but creation of the virtual environment failed."
  }
}

Write-Host "Installing/updating Ultralytics export tools..."
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upgrade pip."
}

& $VenvPython -m pip install --upgrade ultralytics
if ($LASTEXITCODE -ne 0) {
  throw "Failed to install Ultralytics."
}

Write-Host "Exporting the person model to LiteRT/TFLite..."
& $VenvPython $Exporter --model $Model --output $Output --image-size 640
if ($LASTEXITCODE -ne 0) {
  throw "The model export command failed."
}

if (-not (Test-Path $Output)) {
  throw "Export failed: $Output was not created."
}

Write-Host ""
Write-Host "Offline person model is ready:" -ForegroundColor Green
Write-Host $Output
Write-Host "Next: npm install, then npx expo prebuild --platform android --clean"
