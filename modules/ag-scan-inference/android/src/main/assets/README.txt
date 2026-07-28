Required model:
- life_jacket.tflite: YOLO11 wear/notwear detector. Class 0 = notwear; class 1 = wear.

Optional fallback model:
- person.tflite: COCO person detector used only when the wear/notwear model returns no boxes.

Both models run entirely on the Android device. Do not replace life_jacket.tflite with
person.tflite, and do not rename either file without updating OnDeviceSafetyDetector.kt.
