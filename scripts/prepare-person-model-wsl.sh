#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${1:-}"
if [[ -z "$PROJECT_ROOT" || ! -d "$PROJECT_ROOT" ]]; then
  echo "Usage: prepare-person-model-wsl.sh /absolute/path/to/agscan-offline-v1" >&2
  exit 2
fi

MODEL="$PROJECT_ROOT/model-source/yolo11n.pt"
OUTPUT="$PROJECT_ROOT/modules/ag-scan-inference/android/src/main/assets/person.tflite"
EXPORTER="$PROJECT_ROOT/scripts/export_person_model.py"
VENV="$HOME/.venvs/agscan-litert"

if [[ ! -f "$MODEL" ]]; then
  echo "Missing source model: $MODEL" >&2
  exit 3
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is missing inside WSL." >&2
  echo "Run: sudo apt update && sudo apt install -y python3 python3-venv python3-pip" >&2
  exit 4
fi

mkdir -p "$HOME/.venvs"
if [[ ! -x "$VENV/bin/python" ]]; then
  echo "Creating Linux Python environment..."
  if ! python3 -m venv "$VENV"; then
    echo >&2
    echo "Ubuntu is missing the venv package." >&2
    echo "Run this inside Ubuntu, then rerun the PowerShell wrapper:" >&2
    echo "  sudo apt update && sudo apt install -y python3-venv python3-pip" >&2
    exit 5
  fi
fi

PYTHON="$VENV/bin/python"

echo "Installing/updating Ultralytics export tools inside WSL..."
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install --upgrade ultralytics

echo "Exporting YOLO11n to LiteRT/TFLite inside Linux..."
"$PYTHON" "$EXPORTER" \
  --model "$MODEL" \
  --output "$OUTPUT" \
  --image-size 640

if [[ ! -f "$OUTPUT" ]]; then
  echo "Export failed: $OUTPUT was not created." >&2
  exit 6
fi

echo
echo "Offline person model is ready:"
ls -lh "$OUTPUT"
echo "Return to Windows PowerShell and run:"
echo "  npm install"
echo "  node .\\scripts\\verify-offline-ready.js"
echo "  npx expo prebuild --platform android --clean"
