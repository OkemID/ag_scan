# AG Scan Offline Android — Wear/Not-Wear Model

This package runs the trained AG Scan life-jacket detector entirely on Android.
No FastAPI server, Wi-Fi, mobile data or Python runtime is required after installation.

## Active on-device decision path

1. The camera captures a still frame.
2. `life_jacket.tflite` detects people as either `wear` or `notwear`.
3. Kotlin applies confidence thresholds and class-agnostic non-maximum suppression.
4. The app returns one of:
   - `LIFE_JACKET_CHECK_PASSED`
   - `LIFE_JACKET_MISSING`
   - `MANUAL_CHECK_REQUIRED`
   - `NO_PERSON`
5. `person.tflite` is used only as a fallback when the wear/not-wear model returns no boxes.

The legacy HSV colour test is no longer used for pass/fail decisions.

## Model files

```text
modules/ag-scan-inference/android/src/main/assets/
  life_jacket.tflite   # required; class 0 = notwear, class 1 = wear
  person.tflite        # optional no-person fallback
```

## Verify the package

```powershell
node .\scripts\verify-offline-ready.js
```

Expected output includes:

```text
life_jacket.tflite found
Wear/not-wear model is the active decision path
No backend dependency found in the active scan path
```

## Build with EAS

The fastest installable build does not require Android Studio or ADB:

```powershell
npm install
npx eas-cli@latest build --platform android --profile preview
```

The `preview` profile creates an APK. Open the EAS link on the Android phone and install it.

## Native rebuild rule

Any change to Kotlin, the Expo native module, `app.json`, or either `.tflite` file requires a
new native Android build. JavaScript-only changes can use the existing development build.

## Decision threshold

The interface defaults to 60%. A box below the selected threshold becomes `uncertain` and
forces `MANUAL_CHECK_REQUIRED`. A confident `notwear` result always prevents a pass.

For multiple people:

```text
All confident wear               -> LIFE_JACKET_CHECK_PASSED
Any confident notwear            -> LIFE_JACKET_MISSING
Any uncertain result             -> MANUAL_CHECK_REQUIRED
No wear/notwear boxes + no person -> NO_PERSON
```

## Important limitation

This model recognises visible patterns learned from the training dataset. It cannot verify:

- certification or regulatory approval;
- buoyancy;
- fastening and fit;
- damage or deterioration;
- whether the device is suitable for a particular operation.

Always perform a physical safety inspection.
