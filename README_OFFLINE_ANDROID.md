# AG Scan Offline Android V1

This source package converts the uploaded AG Scan frontend into an Android-only,
standalone application.

## What runs on the phone

1. `person.tflite` detects people with YOLO11n.
2. Kotlin crops each detected person's upper and middle body.
3. Kotlin HSV analysis measures recognised yellow, orange, green and red safety colours.
4. React Native displays the result, boxes, scan history and audio alert.

The scan path contains no FastAPI URL, HTTP request, Python runtime or remote database.
The original backend is not required after installation.

## Important V1 limitation

This release recognises colour patterns; it does not understand or certify a life
jacket. The app intentionally displays `COLOUR CHECK PASSED` and
`MANUAL CHECK REQUIRED`, rather than claiming that a life jacket has been confirmed.

Later, a trained `best.pt` can be exported as a second `.tflite` model and inserted
before the HSV fallback.

---

## 1. Requirements on Windows

Install:

- Node.js 20 or newer
- Python 3.10, 3.11 or 3.12
- Android Studio, including Android SDK and platform tools
- Java/OpenJDK 17
- A USB cable, with Android Developer options and USB debugging enabled

For cloud APK/AAB builds, also create an Expo account and install EAS CLI.

## 2. Export the included YOLO person model

Ultralytics LiteRT export is not supported by native Windows. Run only the model
conversion inside WSL2/Ubuntu, while keeping Expo and Android builds in Windows.

From an Administrator PowerShell, install WSL once if needed:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart Windows and initialise Ubuntu. Then open ordinary PowerShell in this project:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\prepare-person-model-wsl.ps1
```

If Ubuntu reports that `venv` is missing, open Ubuntu and run:

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip
```

Then rerun the PowerShell wrapper. It:

- creates a Linux Python environment under `~/.venvs/agscan-litert`;
- installs Ultralytics inside WSL;
- exports `model-source/yolo11n.pt` using `format="litert"`;
- selects the FLOAT32 `.tflite` file;
- copies it to:

```text
modules/ag-scan-inference/android/src/main/assets/person.tflite
```

Confirm it exists:

```powershell
Get-Item .\modules\ag-scan-inference\android\src\main\assets\person.tflite
```

## 3. Install JavaScript packages

```powershell
npm install
```

## 4. Verify that the active scan path is offline

```powershell
node .\scripts\verify-offline-ready.js
```

Expected output includes:

```text
person.tflite found
No backend dependency found in the active scan path
Source is ready for Android prebuild
```

## 5. Generate the native Android project

```powershell
npx expo prebuild --platform android --clean
```

The local Expo module under `modules/ag-scan-inference` is automatically linked into
the generated Android project.

Do not test this application with Expo Go. Expo Go does not contain the custom Kotlin
AI module.

## 6. Run it on a connected Android phone

Connect the phone, approve USB debugging, then check the connection:

```powershell
adb devices
```

Build and install:

```powershell
npx expo run:android --device
```

Select the phone when prompted.

Native Kotlin changes require another Android rebuild. JavaScript-only changes can use
the normal development server after the native app has been built.

## 7. Build an independent APK

Install and sign in to EAS:

```powershell
npm install --global eas-cli
eas login
eas build:configure
```

Build the installable APK:

```powershell
eas build -p android --profile preview
```

Install that APK on the phone. It does not need:

- your laptop;
- Metro;
- Expo Go;
- FastAPI;
- Wi-Fi;
- mobile data.

## 8. Test true offline operation

1. Install the preview APK.
2. Restart the phone.
3. Enable airplane mode.
4. Confirm Wi-Fi is also off.
5. Open AG Scan Offline.
6. Confirm the header says `ON-DEVICE` and `Ready`.
7. Test an empty scene.
8. Test a person wearing ordinary dark clothing.
9. Test recognised orange/yellow safety clothing.
10. Test two people where only one has recognised safety colouring.
11. close and reopen the app while still offline.

Expected logic:

```text
No person found               -> NO PERSON
Every detected torso passes   -> COLOUR CHECK PASSED
Any detected torso fails      -> MANUAL CHECK REQUIRED
```

Start with the back camera. Front-camera preview mirroring should be calibrated before
using it operationally.

## 9. Build the Google Play AAB

The Android package currently is:

```text
com.okem.agscan
```

Change it in `app.json` before the first Play Store upload if that is not the permanent
identifier you want. Do not change it after publishing unless you intend to create a
new Play Store application.

Build:

```powershell
eas build -p android --profile production
```

This produces an Android App Bundle (`.aab`) for Play Console.

## 10. Files that replaced the backend

```text
modules/ag-scan-inference/
  android/src/main/java/expo/modules/agscaninference/
    AGScanInferenceModule.kt
    OnDeviceSafetyDetector.kt
  android/src/main/assets/
    person.tflite

utils/onDeviceInference.js
hooks/useScanner.js
```

The original `utils/api.js` has been removed.

## 11. Upgrade when `best.pt` is available

Do not replace `person.tflite`. It remains the person gate.

Export `best.pt` separately as `life_jacket.tflite`, then add a second native detector:

```text
person.tflite
  -> detected person crop
  -> life_jacket.tflite
  -> HSV only when the trained model is uncertain
```

Keep the V1 colour path as a fallback until the trained model has been tested against
real operational images.

## Python launcher troubleshooting

The model preparation script now detects `py`, `python`, or `python3` automatically. It requires Python 3.10, 3.11, or 3.12. If none is found, install Python 3.12, enable **Add python.exe to PATH**, reopen PowerShell, and rerun:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\prepare-person-model.ps1
```
