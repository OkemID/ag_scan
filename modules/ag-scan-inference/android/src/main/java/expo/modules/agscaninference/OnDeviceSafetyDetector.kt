package expo.modules.agscaninference

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import org.tensorflow.lite.DataType
import org.tensorflow.lite.Interpreter
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

private const val MODEL_ASSET = "person.tflite"
private const val PERSON_CONFIDENCE = 0.25f
private const val PERSON_IOU = 0.50f
private const val MIN_PERSON_AREA_PERCENT = 0.45f
private const val PERSON_BOX_PADDING = 0.08f
private const val MAX_PEOPLE = 20

internal class OnDeviceSafetyDetector(
  private val context: Context
) : AutoCloseable {
  private var interpreter: Interpreter? = null
  private var inputShape: IntArray = intArrayOf()
  private var outputShape: IntArray = intArrayOf()
  private var inputWidth: Int = 0
  private var inputHeight: Int = 0
  private var inputChannelsFirst: Boolean = false
  private var initMessage: String = "Detector has not been initialized."

  @Synchronized
  fun initialize(): Map<String, Any> {
    if (interpreter != null) return status()

    try {
      val modelBuffer = loadAssetBuffer(MODEL_ASSET)
      val options = Interpreter.Options().apply {
        setNumThreads(Runtime.getRuntime().availableProcessors().coerceIn(2, 4))
      }

      val loaded = Interpreter(modelBuffer, options)
      val inTensor = loaded.getInputTensor(0)
      val outTensor = loaded.getOutputTensor(0)

      inputShape = inTensor.shape()
      outputShape = outTensor.shape()

      require(inTensor.dataType() == DataType.FLOAT32) {
        "AG Scan V1 expects a FLOAT32 person model, but received ${inTensor.dataType()}."
      }
      require(outTensor.dataType() == DataType.FLOAT32) {
        "AG Scan V1 expects FLOAT32 model output, but received ${outTensor.dataType()}."
      }
      val isChannelsFirst =
  inputShape.size == 4 &&
    inputShape[0] == 1 &&
    inputShape[1] == 3

  val isChannelsLast =
    inputShape.size == 4 &&
      inputShape[0] == 1 &&
      inputShape[3] == 3

  require(isChannelsFirst || isChannelsLast) {
    "Unsupported model input ${inputShape.contentToString()}; " +
      "expected NCHW [1, 3, height, width] or NHWC [1, height, width, 3]."
  }

  require(outputShape.size == 3 && outputShape[0] == 1) {
    "Unsupported model output ${outputShape.contentToString()}; expected a 3D YOLO tensor."
  }

  inputChannelsFirst = isChannelsFirst

  if (inputChannelsFirst) {
    inputHeight = inputShape[2]
    inputWidth = inputShape[3]
  } else {
    inputHeight = inputShape[1]
    inputWidth = inputShape[2]
  }
      interpreter = loaded
      initMessage = "Person model loaded. Colour checking runs fully on this phone."
      return status()
    } catch (error: Exception) {
      interpreter?.close()
      interpreter = null
      initMessage = error.message ?: "Could not load the on-device person model."
      return status()
    }
  }

  fun status(): Map<String, Any> = mapOf(
    "ready" to (interpreter != null),
    "mode" to "on-device-yolo+hsv",
    "model" to MODEL_ASSET,
    "inputShape" to inputShape.toList(),
    "outputShape" to outputShape.toList(),
    "inputLayout" to if (inputChannelsFirst) "NCHW" else "NHWC",
    "message" to initMessage,
    "networkRequired" to false
  )

  @Synchronized
  fun scan(imageUri: String, sensitivityInput: Float): Map<String, Any> {
    val startedAt = System.nanoTime()
    val activeInterpreter = interpreter
      ?: throw IllegalStateException("On-device AI is not ready. ${status()["message"]}")

    val sensitivity = sensitivityInput.coerceIn(3f, 25f)
    val bitmap = decodeOrientedBitmap(imageUri)
      ?: return errorResult("Could not decode the camera image.", elapsedMs(startedAt))

    try {
      if (isNearlyBlank(bitmap)) {
        return noPersonResult("Frame appears empty.", "quality-check", elapsedMs(startedAt))
      }

      val prepared = prepareLetterboxedInput(bitmap)
      val detections = runPersonInference(activeInterpreter, prepared)

      if (detections.isEmpty()) {
        return noPersonResult(
          "No person detected — objects and background were ignored.",
          "on-device-yolo-person",
          elapsedMs(startedAt)
        )
      }

      val personResults = detections.map { detection ->
        val hsv = analyseSafetyColours(bitmap, detection, sensitivity)
        PersonColourResult(detection, hsv)
      }

      val manualChecks = personResults.count { !it.hsv.passed }
      val allPassed = manualChecks == 0
      val overallCoverage = personResults.minOfOrNull { it.hsv.coverage } ?: 0f
      val overallConfidence = personResults.minOfOrNull { it.hsv.confidence } ?: 0
      val dominant = personResults
        .filter { it.hsv.vestType != "none" }
        .maxByOrNull { it.hsv.coverage }
        ?.hsv?.vestType ?: "none"

      val boxes = personResults.map { person ->
        mapOf(
          "x" to round4(person.detection.left / bitmap.width.toFloat()),
          "y" to round4(person.detection.top / bitmap.height.toFloat()),
          "w" to round4(person.detection.width / bitmap.width.toFloat()),
          "h" to round4(person.detection.height / bitmap.height.toFloat()),
          "compliant" to person.hsv.passed,
          "coverage" to round1(person.hsv.coverage)
        )
      }

      val verdict: String
      val reason: String
      if (allPassed) {
        verdict = "COLOUR_CHECK_PASSED"
        reason = "Recognised safety colouring was visible on all ${personResults.size} detected person(s). Confirm with a physical safety check."
      } else {
        verdict = "MANUAL_CHECK_REQUIRED"
        reason = "Recognised safety colouring was not sufficiently visible on $manualChecks of ${personResults.size} detected person(s). Inspect manually."
      }

      return mapOf(
        "verdict" to verdict,
        "reason" to reason,
        "confidence" to overallConfidence,
        "coverage" to round1(overallCoverage),
        "vest_type" to dominant,
        "people" to personResults.size,
        "boxes" to boxes,
        "detection_method" to "on-device-yolo+hsv-person-only",
        "duration_ms" to elapsedMs(startedAt),
        "disclaimer" to "Colour detection is an assistance tool and does not confirm that an item is a certified life jacket."
      )
    } finally {
      bitmap.recycle()
    }
  }

  private fun loadAssetBuffer(assetName: String): ByteBuffer {
    val bytes = try {
      context.assets.open(assetName).use { it.readBytes() }
    } catch (error: Exception) {
      throw IllegalStateException(
        "Missing $assetName. Run scripts/prepare-person-model.ps1 before building the app.",
        error
      )
    }

    return ByteBuffer.allocateDirect(bytes.size)
      .order(ByteOrder.nativeOrder())
      .apply {
        put(bytes)
        rewind()
      }
  }

  private fun decodeOrientedBitmap(imageUri: String): Bitmap? {
    val uri = Uri.parse(imageUri)
    val bytes = try {
      when (uri.scheme) {
        "file" -> File(uri.path ?: return null).readBytes()
        "content" -> context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        else -> {
          val file = File(imageUri)
          if (file.exists()) file.readBytes()
          else context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
        }
      }
    } catch (_: Exception) {
      null
    } ?: return null

    val decoded = BitmapFactory.decodeByteArray(
      bytes,
      0,
      bytes.size,
      BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
    ) ?: return null

    val orientation = try {
      ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(
        ExifInterface.TAG_ORIENTATION,
        ExifInterface.ORIENTATION_NORMAL
      )
    } catch (_: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.setRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.setRotate(-90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
      else -> return decoded
    }

    return try {
      Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        .also { if (it !== decoded) decoded.recycle() }
    } catch (_: Exception) {
      decoded
    }
  }

  private fun prepareLetterboxedInput(source: Bitmap): PreparedInput {
    val scale = min(
      inputWidth / source.width.toFloat(),
      inputHeight / source.height.toFloat()
    )
    val resizedWidth = max(1, (source.width * scale).roundToInt())
    val resizedHeight = max(1, (source.height * scale).roundToInt())
    val padX = (inputWidth - resizedWidth) / 2f
    val padY = (inputHeight - resizedHeight) / 2f

    val modelBitmap = Bitmap.createBitmap(inputWidth, inputHeight, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(modelBitmap)
    canvas.drawColor(Color.BLACK)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    val resized = Bitmap.createScaledBitmap(source, resizedWidth, resizedHeight, true)
    canvas.drawBitmap(resized, floor(padX), floor(padY), paint)
    if (resized !== source) resized.recycle()

    val pixels = IntArray(inputWidth * inputHeight)
    modelBitmap.getPixels(pixels, 0, inputWidth, 0, 0, inputWidth, inputHeight)
    modelBitmap.recycle()

    val buffer = ByteBuffer.allocateDirect(pixels.size * 3 * 4)
      .order(ByteOrder.nativeOrder())

  if (inputChannelsFirst) {
    // NCHW: all red values, followed by all green values,
    // followed by all blue values.
    for (pixel in pixels) {
      buffer.putFloat(Color.red(pixel) / 255f)
    }

    for (pixel in pixels) {
      buffer.putFloat(Color.green(pixel) / 255f)
    }

    for (pixel in pixels) {
      buffer.putFloat(Color.blue(pixel) / 255f)
    }
    } else {
      // NHWC: RGB values are interleaved for each pixel.
      for (pixel in pixels) {
        buffer.putFloat(Color.red(pixel) / 255f)
        buffer.putFloat(Color.green(pixel) / 255f)
        buffer.putFloat(Color.blue(pixel) / 255f)
      }
    }
    buffer.rewind()

    return PreparedInput(
      buffer = buffer,
      scale = scale,
      padX = padX,
      padY = padY,
      sourceWidth = source.width,
      sourceHeight = source.height
    )
  }

  private fun runPersonInference(
    activeInterpreter: Interpreter,
    prepared: PreparedInput
  ): List<PersonDetection> {
    val elementCount = outputShape.fold(1) { total, value -> total * value }
    val outputBuffer = ByteBuffer.allocateDirect(elementCount * 4)
      .order(ByteOrder.nativeOrder())

    activeInterpreter.run(prepared.buffer, outputBuffer)
    outputBuffer.rewind()

    val values = FloatArray(elementCount)
    outputBuffer.asFloatBuffer().get(values)

    return parseYoloOutput(values, prepared)
  }

  private fun parseYoloOutput(
    values: FloatArray,
    prepared: PreparedInput
  ): List<PersonDetection> {
    val dimA = outputShape[1]
    val dimB = outputShape[2]
    val channelsFirst = dimA <= 512 && dimB > dimA
    val channels = if (channelsFirst) dimA else dimB
    val candidates = if (channelsFirst) dimB else dimA

    require(channels >= 5) {
      "Unsupported YOLO output ${outputShape.contentToString()}: fewer than five channels."
    }

    fun value(candidate: Int, channel: Int): Float {
      return if (channelsFirst) {
        values[channel * candidates + candidate]
      } else {
        values[candidate * channels + channel]
      }
    }

    val raw = ArrayList<PersonDetection>()

    for (candidate in 0 until candidates) {
      val inputLeft: Float
      val inputTop: Float
      val inputRight: Float
      val inputBottom: Float
      val score: Float

      if (channels == 6) {
        // Optional post-NMS format: x1, y1, x2, y2, score, class.
        val classId = value(candidate, 5).roundToInt()
        if (classId != 0) continue
        score = value(candidate, 4)
        if (score < PERSON_CONFIDENCE) continue

        inputLeft = scaleCoordinate(value(candidate, 0), inputWidth)
        inputTop = scaleCoordinate(value(candidate, 1), inputHeight)
        inputRight = scaleCoordinate(value(candidate, 2), inputWidth)
        inputBottom = scaleCoordinate(value(candidate, 3), inputHeight)
      } else {
        // Ultralytics YOLO11 raw format: cx, cy, width, height, class scores.
        score = value(candidate, 4) // COCO class 0 = person
        if (score < PERSON_CONFIDENCE) continue

        val centerX = scaleCoordinate(value(candidate, 0), inputWidth)
        val centerY = scaleCoordinate(value(candidate, 1), inputHeight)
        val width = scaleCoordinate(value(candidate, 2), inputWidth)
        val height = scaleCoordinate(value(candidate, 3), inputHeight)

        inputLeft = centerX - width / 2f
        inputTop = centerY - height / 2f
        inputRight = centerX + width / 2f
        inputBottom = centerY + height / 2f
      }

      var left = (inputLeft - prepared.padX) / prepared.scale
      var top = (inputTop - prepared.padY) / prepared.scale
      var right = (inputRight - prepared.padX) / prepared.scale
      var bottom = (inputBottom - prepared.padY) / prepared.scale

      left = left.coerceIn(0f, prepared.sourceWidth - 1f)
      top = top.coerceIn(0f, prepared.sourceHeight - 1f)
      right = right.coerceIn(left + 1f, prepared.sourceWidth.toFloat())
      bottom = bottom.coerceIn(top + 1f, prepared.sourceHeight.toFloat())

      val areaPercent = ((right - left) * (bottom - top) /
        (prepared.sourceWidth * prepared.sourceHeight).toFloat()) * 100f
      if (areaPercent < MIN_PERSON_AREA_PERCENT) continue

      raw.add(PersonDetection(left, top, right, bottom, score))
    }

    val selected = nonMaximumSuppression(raw, PERSON_IOU, MAX_PEOPLE)
    return selected.map { expandBox(it, prepared.sourceWidth, prepared.sourceHeight) }
  }

  private fun scaleCoordinate(value: Float, dimension: Int): Float {
    return if (abs(value) <= 2f) value * dimension else value
  }

  private fun nonMaximumSuppression(
    boxes: List<PersonDetection>,
    iouThreshold: Float,
    limit: Int
  ): List<PersonDetection> {
    val sorted = boxes.sortedByDescending { it.score }
    val selected = ArrayList<PersonDetection>()

    for (candidate in sorted) {
      if (selected.any { intersectionOverUnion(candidate, it) > iouThreshold }) continue
      selected.add(candidate)
      if (selected.size >= limit) break
    }
    return selected
  }

  private fun intersectionOverUnion(a: PersonDetection, b: PersonDetection): Float {
    val overlapLeft = max(a.left, b.left)
    val overlapTop = max(a.top, b.top)
    val overlapRight = min(a.right, b.right)
    val overlapBottom = min(a.bottom, b.bottom)
    val overlapWidth = max(0f, overlapRight - overlapLeft)
    val overlapHeight = max(0f, overlapBottom - overlapTop)
    val intersection = overlapWidth * overlapHeight
    val union = a.width * a.height + b.width * b.height - intersection
    return if (union <= 0f) 0f else intersection / union
  }

  private fun expandBox(
    box: PersonDetection,
    imageWidth: Int,
    imageHeight: Int
  ): PersonDetection {
    val padX = box.width * PERSON_BOX_PADDING
    val padY = box.height * PERSON_BOX_PADDING
    return PersonDetection(
      left = (box.left - padX).coerceAtLeast(0f),
      top = (box.top - padY).coerceAtLeast(0f),
      right = (box.right + padX).coerceAtMost(imageWidth.toFloat()),
      bottom = (box.bottom + padY).coerceAtMost(imageHeight.toFloat()),
      score = box.score
    )
  }

  private fun analyseSafetyColours(
    bitmap: Bitmap,
    person: PersonDetection,
    sensitivity: Float
  ): HsvResult {
    val torsoLeft = (person.left + person.width * 0.10f).roundToInt()
      .coerceIn(0, bitmap.width - 1)
    val torsoRight = (person.left + person.width * 0.90f).roundToInt()
      .coerceIn(torsoLeft + 1, bitmap.width)
    val torsoTop = (person.top + person.height * 0.08f).roundToInt()
      .coerceIn(0, bitmap.height - 1)
    val torsoBottom = (person.top + person.height * 0.72f).roundToInt()
      .coerceIn(torsoTop + 1, bitmap.height)

    val torsoWidth = torsoRight - torsoLeft
    val torsoHeight = torsoBottom - torsoTop
    val maxSamples = 24_000f
    val sampleScale = min(1f, sqrt(maxSamples / (torsoWidth * torsoHeight).toFloat()))
    val sampledWidth = max(1, ceil(torsoWidth * sampleScale).toInt())
    val sampledHeight = max(1, ceil(torsoHeight * sampleScale).toInt())

    val torso = Bitmap.createBitmap(bitmap, torsoLeft, torsoTop, torsoWidth, torsoHeight)
    val sampled = if (sampledWidth != torsoWidth || sampledHeight != torsoHeight) {
      Bitmap.createScaledBitmap(torso, sampledWidth, sampledHeight, true)
    } else {
      torso
    }

    val pixels = IntArray(sampledWidth * sampledHeight)
    sampled.getPixels(pixels, 0, sampledWidth, 0, 0, sampledWidth, sampledHeight)

    if (sampled !== torso) sampled.recycle()
    torso.recycle()

    var yellow = 0
    var orange = 0
    var green = 0
    var red = 0
    var marineYellow = 0
    var safetyPixels = 0
    val hsv = FloatArray(3)

    for (pixel in pixels) {
      Color.RGBToHSV(Color.red(pixel), Color.green(pixel), Color.blue(pixel), hsv)
      val hue = hsv[0] // Android: 0..360; OpenCV's original thresholds were doubled.
      val saturation = hsv[1]
      val value = hsv[2]

      val vivid = saturation >= (70f / 255f) && value >= (60f / 255f)
      if (!vivid) continue

      val isYellow = hue in 44f..110f && saturation >= (80f / 255f)
      val isOrange = hue in 12f..48f && saturation >= (100f / 255f)
      val isGreen = hue in 110f..170f && saturation >= (90f / 255f)
      val isRed = (hue <= 16f || hue >= 330f) &&
        saturation >= (115f / 255f) && value >= (75f / 255f)
      val isMarineYellow = hue in 40f..100f &&
        saturation >= (110f / 255f) && value >= (90f / 255f)

      if (isYellow) yellow++
      if (isOrange) orange++
      if (isGreen) green++
      if (isRed) red++
      if (isMarineYellow) marineYellow++
      if (isYellow || isOrange || isGreen || isRed || isMarineYellow) safetyPixels++
    }

    val coverage = if (pixels.isEmpty()) 0f else safetyPixels * 100f / pixels.size.toFloat()
    val counts = listOf(
      "hi-vis yellow" to yellow,
      "hi-vis orange" to orange,
      "safety green" to green,
      "rescue red" to red,
      "marine yellow" to marineYellow
    )
    val dominant = counts.maxByOrNull { it.second }
      ?.takeIf { it.second > 0 }
      ?.first ?: "none"
    val passed = coverage >= sensitivity
    val confidence = if (passed) {
      (55 + (coverage * 2f).toInt()).coerceIn(55, 90)
    } else {
      (50 + ((sensitivity - coverage).coerceAtLeast(0f) * 3f).toInt()).coerceIn(45, 90)
    }

    return HsvResult(
      passed = passed,
      coverage = coverage,
      vestType = if (passed) dominant else "none",
      confidence = confidence
    )
  }

  private fun isNearlyBlank(bitmap: Bitmap): Boolean {
    val targetSamples = 4_096f
    val step = max(1, sqrt((bitmap.width * bitmap.height) / targetSamples).toInt())
    var count = 0
    var sum = 0.0
    var sumSquares = 0.0

    var y = 0
    while (y < bitmap.height) {
      var x = 0
      while (x < bitmap.width) {
        val pixel = bitmap.getPixel(x, y)
        val gray = 0.299 * Color.red(pixel) +
          0.587 * Color.green(pixel) +
          0.114 * Color.blue(pixel)
        sum += gray
        sumSquares += gray * gray
        count++
        x += step
      }
      y += step
    }

    if (count == 0) return true
    val mean = sum / count
    val variance = max(0.0, (sumSquares / count) - mean * mean)
    return sqrt(variance) < 12.0
  }

  private fun noPersonResult(
    reason: String,
    method: String,
    durationMs: Long
  ): Map<String, Any> = mapOf(
    "verdict" to "NO_PERSON",
    "reason" to reason,
    "confidence" to 80,
    "coverage" to 0.0,
    "vest_type" to "none",
    "people" to 0,
    "boxes" to emptyList<Map<String, Any>>(),
    "detection_method" to method,
    "duration_ms" to durationMs,
    "disclaimer" to "No safety decision was made."
  )

  private fun errorResult(message: String, durationMs: Long): Map<String, Any> = mapOf(
    "verdict" to "UNKNOWN",
    "reason" to message,
    "confidence" to 0,
    "coverage" to 0.0,
    "vest_type" to "none",
    "people" to 0,
    "boxes" to emptyList<Map<String, Any>>(),
    "detection_method" to "error",
    "duration_ms" to durationMs
  )

  private fun elapsedMs(startedAt: Long): Long =
    (System.nanoTime() - startedAt) / 1_000_000L

  private fun round1(value: Float): Double =
    kotlin.math.round(value * 10.0) / 10.0

  private fun round4(value: Float): Double =
    kotlin.math.round(value * 10_000.0) / 10_000.0

  override fun close() {
    interpreter?.close()
    interpreter = null
  }
}

private data class PreparedInput(
  val buffer: ByteBuffer,
  val scale: Float,
  val padX: Float,
  val padY: Float,
  val sourceWidth: Int,
  val sourceHeight: Int
)

private data class PersonDetection(
  val left: Float,
  val top: Float,
  val right: Float,
  val bottom: Float,
  val score: Float
) {
  val width: Float get() = right - left
  val height: Float get() = bottom - top
}

private data class HsvResult(
  val passed: Boolean,
  val coverage: Float,
  val vestType: String,
  val confidence: Int
)

private data class PersonColourResult(
  val detection: PersonDetection,
  val hsv: HsvResult
)
