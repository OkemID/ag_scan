Run scripts/prepare-person-model.ps1 from the project root.
It exports model-source/yolo11n.pt and writes person.tflite into this directory.
The Android build can compile without the model, but the app will report that AI is unavailable.
