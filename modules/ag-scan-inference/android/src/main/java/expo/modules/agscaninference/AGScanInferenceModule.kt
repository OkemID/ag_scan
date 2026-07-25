package expo.modules.agscaninference

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class AGScanInferenceModule : Module() {
  private var detector: OnDeviceSafetyDetector? = null

  override fun definition() = ModuleDefinition {
    Name("AGScanInference")

    AsyncFunction("initialize") {
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("Android application context is unavailable.")

      val engine = detector ?: OnDeviceSafetyDetector(context).also { detector = it }
      return@AsyncFunction engine.initialize()
    }

    AsyncFunction("scan") { imageUri: String, sensitivity: Double, deleteAfterScan: Boolean ->
      val context = appContext.reactContext?.applicationContext
        ?: throw IllegalStateException("Android application context is unavailable.")

      val engine = detector ?: OnDeviceSafetyDetector(context).also {
        it.initialize()
        detector = it
      }

      try {
        return@AsyncFunction engine.scan(imageUri, sensitivity.toFloat())
      } finally {
        if (deleteAfterScan) {
          deleteTemporaryCameraFile(context.cacheDir, context.externalCacheDir, imageUri)
        }
      }
    }

    Function("getStatus") {
      return@Function detector?.status() ?: mapOf(
        "ready" to false,
        "mode" to "on-device-yolo+hsv",
        "message" to "Detector has not been initialized."
      )
    }

    OnDestroy {
      detector?.close()
      detector = null
    }
  }

  private fun deleteTemporaryCameraFile(
    cacheDir: File,
    externalCacheDir: File?,
    imageUri: String
  ) {
    try {
      val uri = Uri.parse(imageUri)
      if (uri.scheme != "file") return

      val path = uri.path ?: return
      val file = File(path)
      val canonicalPath = file.canonicalPath
      val internalCache = cacheDir.canonicalPath
      val externalCache = externalCacheDir?.canonicalPath

      val isCacheFile = canonicalPath.startsWith(internalCache) ||
        (externalCache != null && canonicalPath.startsWith(externalCache))

      if (isCacheFile && file.exists()) {
        file.delete()
      }
    } catch (_: Exception) {
      // Cache cleanup must never fail a completed scan.
    }
  }
}
