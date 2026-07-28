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
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

private const val LIFE_JACKET_MODEL_ASSET = "life_jacket.tflite"
private const val PERSON_MODEL_ASSET = "person.tflite"

private const val NOT_WEAR_CLASS_ID = 0
private const val WEAR_CLASS_ID = 1

private const val CANDIDATE_CONFIDENCE = 0.20f
private const val PERSON_CONFIDENCE = 0.25f
private const val NMS_IOU = 0.50f
private const val MIN_BOX_AREA_PERCENT = 0.35f
private const val BOX_PADDING = 0.02f
private const val MAX_PEOPLE = 20

internal class OnDeviceSafetyDetector(
  private val context: Context
) : AutoCloseable {
  private var lifeJacketRuntime: ModelRuntime? = null
  private var personRuntime: ModelRuntime? = null
  private var initMessage: String = "Detector has not been initialized."

  @Synchronized
  fun initialize(): Map<String, Any> {
    if (lifeJacketRuntime != null) return status()

    return try {
      lifeJacketRuntime = loadRuntime(LIFE_JACKET_MODEL_ASSET)
      personRuntime = try {
        loadRuntime(PERSON_MODEL_ASSET)
      } catch (_: Exception) {
        null
      }

      val fallbackMessage = if (personRuntime != null) {
        "Person fallback is ready."
      } else {
        "Person fallback is unavailable; the life-jacket model remains active."
      }

      initMessage = "Wear/not-wear model loaded. $fallbackMessage"
      status()
    } catch (error: Exception) {
      close()
      initMessage = error.message ?: "Could not load the on-device life-jacket model."
      status()
    }
  }

  fun status(): Map<String, Any> {
    val life = lifeJacketRuntime
    val person = personRuntime

    return mapOf(
      "ready" to (life != null),
      "mode" to "on-device-yolo-wear-notwear",
      "model" to LIFE_JACKET_MODEL_ASSET,
      "classes" to listOf("notwear", "wear"),
      "inputShape" to (life?.inputShape?.toList() ?: emptyList<Int>()),
      "outputShape" to (life?.outputShape?.toList() ?: emptyList<Int>()),
      "inputLayout" to when {
        life == null -> "unknown"
        life.inputChannelsFirst -> "NCHW"
        else -> "NHWC"
      },
      "outputLayout" to when {
        life == null -> "unknown"
        life.outputChannelsFirst -> "channels-first"
        else -> "candidates-first"
      },
      "personFallbackReady" to (person != null),
      "message" to initMessage,
      "networkRequired" to false
    )
  }

  @Synchronized
  fun scan(imageUri: String, confidenceThresholdInput: Float): Map<String, Any> {
    val startedAt = System.nanoTime()
    val life = lifeJacketRuntime
      ?: throw IllegalStateException("On-device AI is not ready. ${status()["message"]}")

    val decisionThreshold = (confidenceThresholdInput / 100f).coerceIn(0.35f, 0.90f)
    val bitmap = decodeOrientedBitmap(imageUri)
      ?: return errorResult("Could not decode the camera image.", elapsedMs(startedAt))

    try {
      if (isNearlyBlank(bitmap)) {
        return noPersonResult("Frame appears empty.", "quality-check", elapsedMs(startedAt))
      }

      val lifeInput = prepareLetterboxedInput(bitmap, life)
      val lifeValues = runFloatModel(life, lifeInput)
      val detections = parseLifeJacketOutput(life, lifeValues, lifeInput)

      if (detections.isEmpty()) {
        val fallback = personRuntime
        if (fallback != null) {
          val personInput = prepareLetterboxedInput(bitmap, fallback)
          val personValues = runFloatModel(fallback, personInput)
          val people = parsePersonOutput(fallback, personValues, personInput)

          if (people.isEmpty()) {
            return noPersonResult(
              "No person detected. Move closer and keep the full person inside the frame.",
              "on-device-yolo-person-fallback",
              elapsedMs(startedAt)
            )
          }

          return manualResult(
            reason = "${people.size} person(s) detected, but the wear/not-wear model was not confident enough. Reframe and inspect manually.",
            people = people.size,
            boxes = people.map { person ->
              person.toBoxMap(
                sourceWidth = bitmap.width,
                sourceHeight = bitmap.height,
                decision = "uncertain",
                className = "person",
                confidence = person.score
              )
            },
            confidence = 0,
            durationMs = elapsedMs(startedAt)
          )
        }

        return manualResult(
          reason = "No confident wear/not-wear detection was produced. Reframe the person and inspect manually.",
          people = 0,
          boxes = emptyList(),
          confidence = 0,
          durationMs = elapsedMs(startedAt)
        )
      }

      val evaluated = detections.map { detection ->
        val decision = when {
          detection.score < decisionThreshold -> "uncertain"
          detection.classId == WEAR_CLASS_ID -> "wear"
          else -> "notwear"
        }
        EvaluatedDetection(detection, decision)
      }

      val wearingCount = evaluated.count { it.decision == "wear" }
      val notWearingCount = evaluated.count { it.decision == "notwear" }
      val uncertainCount = evaluated.count { it.decision == "uncertain" }
      val complianceRate = if (evaluated.isEmpty()) {
        0f
      } else {
        wearingCount * 100f / evaluated.size.toFloat()
      }

      val boxes = evaluated.map { result ->
        result.detection.toBoxMap(
          sourceWidth = bitmap.width,
          sourceHeight = bitmap.height,
          decision = result.decision,
          className = className(result.detection.classId),
          confidence = result.detection.score
        )
      }

      val verdict: String
      val reason: String
      val overallConfidence: Int

      when {
        notWearingCount > 0 -> {
          verdict = "LIFE_JACKET_MISSING"
          reason = "$notWearingCount of ${evaluated.size} detected person(s) is classified as not wearing a life jacket."
          overallConfidence = evaluated
            .filter { it.decision == "notwear" }
            .maxOf { (it.detection.score * 100f).roundToInt() }
        }

        uncertainCount > 0 -> {
          verdict = "MANUAL_CHECK_REQUIRED"
          reason = "$uncertainCount of ${evaluated.size} detected person(s) is below the ${percentage(decisionThreshold)} decision threshold. Inspect manually."
          overallConfidence = evaluated
            .minOfOrNull { (it.detection.score * 100f).roundToInt() }
            ?: 0
        }

        wearingCount == evaluated.size -> {
          verdict = "LIFE_JACKET_CHECK_PASSED"
          reason = "All ${evaluated.size} detected person(s) are classified as wearing a life jacket. Confirm fit and fastening physically."
          overallConfidence = evaluated
            .minOf { (it.detection.score * 100f).roundToInt() }
        }

        else -> {
          verdict = "MANUAL_CHECK_REQUIRED"
          reason = "The model produced an inconclusive result. Inspect manually."
          overallConfidence = evaluated
            .minOfOrNull { (it.detection.score * 100f).roundToInt() }
            ?: 0
        }
      }

      val resultType = when {
        notWearingCount > 0 && wearingCount > 0 -> "mixed"
        notWearingCount > 0 -> "not_wearing"
        uncertainCount > 0 -> "uncertain"
        wearingCount > 0 -> "wearing"
        else -> "none"
      }

      return mapOf(
        "verdict" to verdict,
        "reason" to reason,
        "confidence" to overallConfidence.coerceIn(0, 100),
        "coverage" to round1(complianceRate),
        "compliance_rate" to round1(complianceRate),
        "vest_type" to resultType,
        "people" to evaluated.size,
        "wearing" to wearingCount,
        "not_wearing" to notWearingCount,
        "uncertain" to uncertainCount,
        "decision_threshold" to percentage(decisionThreshold),
        "boxes" to boxes,
        "detection_method" to "on-device-yolo-wear-notwear",
        "duration_ms" to elapsedMs(startedAt),
        "disclaimer" to "This visual model is an assistance tool. It does not verify certification, buoyancy, fit, fastening or physical condition."
      )
    } catch (error: Exception) {
      return errorResult(
        error.message ?: "The on-device model could not complete the scan.",
        elapsedMs(startedAt)
      )
    } finally {
      bitmap.recycle()
    }
  }

  private fun loadRuntime(assetName: String): ModelRuntime {
    val modelBuffer = loadAssetBuffer(assetName)
    val options = Interpreter.Options().apply {
      setNumThreads(Runtime.getRuntime().availableProcessors().coerceIn(2, 4))
    }

    val interpreter = Interpreter(modelBuffer, options)

    try {
      val inputTensor = interpreter.getInputTensor(0)
      val outputTensor = interpreter.getOutputTensor(0)
      val inputShape = inputTensor.shape()
      val outputShape = outputTensor.shape()

      require(inputTensor.dataType() == DataType.FLOAT32) {
        "$assetName expects a FLOAT32 input, but received ${inputTensor.dataType()}."
      }
      require(outputTensor.dataType() == DataType.FLOAT32) {
        "$assetName expects a FLOAT32 output, but received ${outputTensor.dataType()}."
      }

      val inputChannelsFirst =
        inputShape.size == 4 && inputShape[0] == 1 && inputShape[1] == 3
      val inputChannelsLast =
        inputShape.size == 4 && inputShape[0] == 1 && inputShape[3] == 3

      require(inputChannelsFirst || inputChannelsLast) {
        "Unsupported input ${inputShape.contentToString()} for $assetName; expected NCHW or NHWC RGB input."
      }
      require(outputShape.size == 3 && outputShape[0] == 1) {
        "Unsupported output ${outputShape.contentToString()} for $assetName; expected a 3D YOLO tensor."
      }

      val inputHeight = if (inputChannelsFirst) inputShape[2] else inputShape[1]
      val inputWidth = if (inputChannelsFirst) inputShape[3] else inputShape[2]

      val dimA = outputShape[1]
      val dimB = outputShape[2]
      val outputChannelsFirst = dimA <= 512 && dimB > dimA
      val outputChannels = if (outputChannelsFirst) dimA else dimB
      val outputCandidates = if (outputChannelsFirst) dimB else dimA

      require(outputChannels >= 5) {
        "Unsupported output ${outputShape.contentToString()} for $assetName; fewer than five channels."
      }

      return ModelRuntime(
        assetName = assetName,
        interpreter = interpreter,
        inputShape = inputShape,
        outputShape = outputShape,
        inputWidth = inputWidth,
        inputHeight = inputHeight,
        inputChannelsFirst = inputChannelsFirst,
        outputChannelsFirst = outputChannelsFirst,
        outputChannels = outputChannels,
        outputCandidates = outputCandidates
      )
    } catch (error: Exception) {
      interpreter.close()
      throw error
    }
  }

  private fun loadAssetBuffer(assetName: String): ByteBuffer {
    val bytes = try {
      context.assets.open(assetName).use { it.readBytes() }
    } catch (error: Exception) {
      throw IllegalStateException("Missing $assetName in the Android assets directory.", error)
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

  private fun prepareLetterboxedInput(
    source: Bitmap,
    runtime: ModelRuntime
  ): PreparedInput {
    val scale = min(
      runtime.inputWidth / source.width.toFloat(),
      runtime.inputHeight / source.height.toFloat()
    )
    val resizedWidth = max(1, (source.width * scale).roundToInt())
    val resizedHeight = max(1, (source.height * scale).roundToInt())
    val padX = (runtime.inputWidth - resizedWidth) / 2f
    val padY = (runtime.inputHeight - resizedHeight) / 2f

    val modelBitmap = Bitmap.createBitmap(
      runtime.inputWidth,
      runtime.inputHeight,
      Bitmap.Config.ARGB_8888
    )
    val canvas = Canvas(modelBitmap)
    canvas.drawColor(Color.rgb(114, 114, 114))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    val resized = Bitmap.createScaledBitmap(source, resizedWidth, resizedHeight, true)
    canvas.drawBitmap(resized, floor(padX), floor(padY), paint)
    if (resized !== source) resized.recycle()

    val pixels = IntArray(runtime.inputWidth * runtime.inputHeight)
    modelBitmap.getPixels(
      pixels,
      0,
      runtime.inputWidth,
      0,
      0,
      runtime.inputWidth,
      runtime.inputHeight
    )
    modelBitmap.recycle()

    val buffer = ByteBuffer.allocateDirect(pixels.size * 3 * 4)
      .order(ByteOrder.nativeOrder())

    if (runtime.inputChannelsFirst) {
      for (pixel in pixels) buffer.putFloat(Color.red(pixel) / 255f)
      for (pixel in pixels) buffer.putFloat(Color.green(pixel) / 255f)
      for (pixel in pixels) buffer.putFloat(Color.blue(pixel) / 255f)
    } else {
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

  private fun runFloatModel(
    runtime: ModelRuntime,
    prepared: PreparedInput
  ): FloatArray {
    val elementCount = runtime.outputShape.fold(1) { total, value -> total * value }
    val outputBuffer = ByteBuffer.allocateDirect(elementCount * 4)
      .order(ByteOrder.nativeOrder())

    runtime.interpreter.run(prepared.buffer, outputBuffer)
    outputBuffer.rewind()

    return FloatArray(elementCount).also { values ->
      outputBuffer.asFloatBuffer().get(values)
    }
  }

  private fun parseLifeJacketOutput(
    runtime: ModelRuntime,
    values: FloatArray,
    prepared: PreparedInput
  ): List<ClassDetection> {
    require(runtime.outputChannels == 6) {
      "Unsupported ${runtime.assetName} output ${runtime.outputShape.contentToString()}; expected 6 channels for notwear/wear."
    }

    fun value(candidate: Int, channel: Int): Float = if (runtime.outputChannelsFirst) {
      values[channel * runtime.outputCandidates + candidate]
    } else {
      values[candidate * runtime.outputChannels + channel]
    }

    val appearsPostNms = runtime.outputCandidates <= 500
    val raw = ArrayList<ClassDetection>()

    for (candidate in 0 until runtime.outputCandidates) {
      val classId: Int
      val score: Float
      val inputLeft: Float
      val inputTop: Float
      val inputRight: Float
      val inputBottom: Float

      if (appearsPostNms) {
        classId = value(candidate, 5).roundToInt()
        if (classId != NOT_WEAR_CLASS_ID && classId != WEAR_CLASS_ID) continue

        score = value(candidate, 4)
        if (!score.isFinite() || score < CANDIDATE_CONFIDENCE) continue

        inputLeft = scaleCoordinate(value(candidate, 0), runtime.inputWidth)
        inputTop = scaleCoordinate(value(candidate, 1), runtime.inputHeight)
        inputRight = scaleCoordinate(value(candidate, 2), runtime.inputWidth)
        inputBottom = scaleCoordinate(value(candidate, 3), runtime.inputHeight)
      } else {
        val notWearScore = value(candidate, 4)
        val wearScore = value(candidate, 5)
        classId = if (wearScore > notWearScore) WEAR_CLASS_ID else NOT_WEAR_CLASS_ID
        score = max(notWearScore, wearScore)
        if (!score.isFinite() || score < CANDIDATE_CONFIDENCE) continue

        val centerX = scaleCoordinate(value(candidate, 0), runtime.inputWidth)
        val centerY = scaleCoordinate(value(candidate, 1), runtime.inputHeight)
        val width = scaleCoordinate(value(candidate, 2), runtime.inputWidth)
        val height = scaleCoordinate(value(candidate, 3), runtime.inputHeight)

        inputLeft = centerX - width / 2f
        inputTop = centerY - height / 2f
        inputRight = centerX + width / 2f
        inputBottom = centerY + height / 2f
      }

      val box = mapBoxToSource(
        inputLeft,
        inputTop,
        inputRight,
        inputBottom,
        prepared
      ) ?: continue

      raw.add(
        ClassDetection(
          left = box.left,
          top = box.top,
          right = box.right,
          bottom = box.bottom,
          score = score,
          classId = classId
        )
      )
    }

    return nonMaximumSuppression(raw, NMS_IOU, MAX_PEOPLE)
      .map { expandBox(it, prepared.sourceWidth, prepared.sourceHeight) }
  }

  private fun parsePersonOutput(
    runtime: ModelRuntime,
    values: FloatArray,
    prepared: PreparedInput
  ): List<ClassDetection> {
    fun value(candidate: Int, channel: Int): Float = if (runtime.outputChannelsFirst) {
      values[channel * runtime.outputCandidates + candidate]
    } else {
      values[candidate * runtime.outputChannels + channel]
    }

    val appearsPostNms = runtime.outputChannels == 6 && runtime.outputCandidates <= 500
    val raw = ArrayList<ClassDetection>()

    for (candidate in 0 until runtime.outputCandidates) {
      val score: Float
      val inputLeft: Float
      val inputTop: Float
      val inputRight: Float
      val inputBottom: Float

      if (appearsPostNms) {
        val classId = value(candidate, 5).roundToInt()
        if (classId != 0) continue

        score = value(candidate, 4)
        if (!score.isFinite() || score < PERSON_CONFIDENCE) continue

        inputLeft = scaleCoordinate(value(candidate, 0), runtime.inputWidth)
        inputTop = scaleCoordinate(value(candidate, 1), runtime.inputHeight)
        inputRight = scaleCoordinate(value(candidate, 2), runtime.inputWidth)
        inputBottom = scaleCoordinate(value(candidate, 3), runtime.inputHeight)
      } else {
        score = value(candidate, 4)
        if (!score.isFinite() || score < PERSON_CONFIDENCE) continue

        val centerX = scaleCoordinate(value(candidate, 0), runtime.inputWidth)
        val centerY = scaleCoordinate(value(candidate, 1), runtime.inputHeight)
        val width = scaleCoordinate(value(candidate, 2), runtime.inputWidth)
        val height = scaleCoordinate(value(candidate, 3), runtime.inputHeight)

        inputLeft = centerX - width / 2f
        inputTop = centerY - height / 2f
        inputRight = centerX + width / 2f
        inputBottom = centerY + height / 2f
      }

      val box = mapBoxToSource(
        inputLeft,
        inputTop,
        inputRight,
        inputBottom,
        prepared
      ) ?: continue

      raw.add(
        ClassDetection(
          left = box.left,
          top = box.top,
          right = box.right,
          bottom = box.bottom,
          score = score,
          classId = 0
        )
      )
    }

    return nonMaximumSuppression(raw, NMS_IOU, MAX_PEOPLE)
      .map { expandBox(it, prepared.sourceWidth, prepared.sourceHeight) }
  }

  private fun mapBoxToSource(
    inputLeft: Float,
    inputTop: Float,
    inputRight: Float,
    inputBottom: Float,
    prepared: PreparedInput
  ): ClassDetection? {
    if (
      !inputLeft.isFinite() ||
      !inputTop.isFinite() ||
      !inputRight.isFinite() ||
      !inputBottom.isFinite()
    ) return null

    var left = (inputLeft - prepared.padX) / prepared.scale
    var top = (inputTop - prepared.padY) / prepared.scale
    var right = (inputRight - prepared.padX) / prepared.scale
    var bottom = (inputBottom - prepared.padY) / prepared.scale

    if (right < left) {
      val swap = left
      left = right
      right = swap
    }
    if (bottom < top) {
      val swap = top
      top = bottom
      bottom = swap
    }

    left = left.coerceIn(0f, prepared.sourceWidth - 1f)
    top = top.coerceIn(0f, prepared.sourceHeight - 1f)
    right = right.coerceIn(left + 1f, prepared.sourceWidth.toFloat())
    bottom = bottom.coerceIn(top + 1f, prepared.sourceHeight.toFloat())

    val areaPercent = ((right - left) * (bottom - top) /
      (prepared.sourceWidth * prepared.sourceHeight).toFloat()) * 100f
    if (areaPercent < MIN_BOX_AREA_PERCENT) return null

    return ClassDetection(left, top, right, bottom, 0f, -1)
  }

  private fun scaleCoordinate(value: Float, dimension: Int): Float {
    return if (abs(value) <= 2f) value * dimension else value
  }

  private fun nonMaximumSuppression(
    boxes: List<ClassDetection>,
    iouThreshold: Float,
    limit: Int
  ): List<ClassDetection> {
    val sorted = boxes.sortedByDescending { it.score }
    val selected = ArrayList<ClassDetection>()

    for (candidate in sorted) {
      if (selected.any { intersectionOverUnion(candidate, it) > iouThreshold }) continue
      selected.add(candidate)
      if (selected.size >= limit) break
    }
    return selected
  }

  private fun intersectionOverUnion(a: ClassDetection, b: ClassDetection): Float {
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
    box: ClassDetection,
    imageWidth: Int,
    imageHeight: Int
  ): ClassDetection {
    val padX = box.width * BOX_PADDING
    val padY = box.height * BOX_PADDING
    return box.copy(
      left = (box.left - padX).coerceAtLeast(0f),
      top = (box.top - padY).coerceAtLeast(0f),
      right = (box.right + padX).coerceAtMost(imageWidth.toFloat()),
      bottom = (box.bottom + padY).coerceAtMost(imageHeight.toFloat())
    )
  }

  private fun ClassDetection.toBoxMap(
    sourceWidth: Int,
    sourceHeight: Int,
    decision: String,
    className: String,
    confidence: Float
  ): Map<String, Any> = mapOf(
    "x" to round4(left / sourceWidth.toFloat()),
    "y" to round4(top / sourceHeight.toFloat()),
    "w" to round4(width / sourceWidth.toFloat()),
    "h" to round4(height / sourceHeight.toFloat()),
    "decision" to decision,
    "class_name" to className,
    "compliant" to (decision == "wear"),
    "confidence" to round1(confidence * 100f),
    "coverage" to round1(confidence * 100f)
  )

  private fun className(classId: Int): String = when (classId) {
    WEAR_CLASS_ID -> "wear"
    NOT_WEAR_CLASS_ID -> "notwear"
    else -> "unknown"
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
    "confidence" to 0,
    "coverage" to 0.0,
    "compliance_rate" to 0.0,
    "vest_type" to "none",
    "people" to 0,
    "wearing" to 0,
    "not_wearing" to 0,
    "uncertain" to 0,
    "boxes" to emptyList<Map<String, Any>>(),
    "detection_method" to method,
    "duration_ms" to durationMs,
    "disclaimer" to "No life-jacket decision was made."
  )

  private fun manualResult(
    reason: String,
    people: Int,
    boxes: List<Map<String, Any>>,
    confidence: Int,
    durationMs: Long
  ): Map<String, Any> = mapOf(
    "verdict" to "MANUAL_CHECK_REQUIRED",
    "reason" to reason,
    "confidence" to confidence,
    "coverage" to 0.0,
    "compliance_rate" to 0.0,
    "vest_type" to "uncertain",
    "people" to people,
    "wearing" to 0,
    "not_wearing" to 0,
    "uncertain" to people,
    "boxes" to boxes,
    "detection_method" to "on-device-yolo-wear-notwear",
    "duration_ms" to durationMs,
    "disclaimer" to "The model was not confident enough for an automatic decision."
  )

  private fun errorResult(message: String, durationMs: Long): Map<String, Any> = mapOf(
    "verdict" to "UNKNOWN",
    "reason" to message,
    "confidence" to 0,
    "coverage" to 0.0,
    "compliance_rate" to 0.0,
    "vest_type" to "none",
    "people" to 0,
    "wearing" to 0,
    "not_wearing" to 0,
    "uncertain" to 0,
    "boxes" to emptyList<Map<String, Any>>(),
    "detection_method" to "error",
    "duration_ms" to durationMs
  )

  private fun percentage(value: Float): Int = (value * 100f).roundToInt()

  private fun elapsedMs(startedAt: Long): Long =
    (System.nanoTime() - startedAt) / 1_000_000L

  private fun round1(value: Float): Double =
    kotlin.math.round(value * 10.0) / 10.0

  private fun round4(value: Float): Double =
    kotlin.math.round(value * 10_000.0) / 10_000.0

  override fun close() {
    lifeJacketRuntime?.interpreter?.close()
    personRuntime?.interpreter?.close()
    lifeJacketRuntime = null
    personRuntime = null
  }
}

private data class ModelRuntime(
  val assetName: String,
  val interpreter: Interpreter,
  val inputShape: IntArray,
  val outputShape: IntArray,
  val inputWidth: Int,
  val inputHeight: Int,
  val inputChannelsFirst: Boolean,
  val outputChannelsFirst: Boolean,
  val outputChannels: Int,
  val outputCandidates: Int
)

private data class PreparedInput(
  val buffer: ByteBuffer,
  val scale: Float,
  val padX: Float,
  val padY: Float,
  val sourceWidth: Int,
  val sourceHeight: Int
)

private data class ClassDetection(
  val left: Float,
  val top: Float,
  val right: Float,
  val bottom: Float,
  val score: Float,
  val classId: Int
) {
  val width: Float get() = right - left
  val height: Float get() = bottom - top
}

private data class EvaluatedDetection(
  val detection: ClassDetection,
  val decision: String
)
