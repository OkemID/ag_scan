# Life-jacket model integration

This update activates `life_jacket.tflite` as the primary scan decision model.

## Changed

- Replaced HSV colour pass/fail decisions with YOLO `notwear`/`wear` detections.
- Preserved `person.tflite` as a fallback when the status model returns no boxes.
- Added class-aware results for wearing, not wearing and uncertain detections.
- Added a configurable decision-confidence threshold.
- Updated bounding boxes, result cards, scan history, copy and disclaimers.
- Updated offline verification to require `life_jacket.tflite`.
- Increased app version to `1.1.0` and Android version code to `2`.

## Model contract

```text
life_jacket.tflite
class 0 = notwear
class 1 = wear
expected raw YOLO output = 4 box channels + 2 class-score channels
```

## Build

```powershell
node .\scripts\verify-offline-ready.js
npx eas-cli@latest build --platform android --profile preview
```
