package `in`.videh.filedtracker.nativeapp.compose

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Face
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import `in`.videh.filedtracker.nativeapp.ApiClient
import `in`.videh.filedtracker.nativeapp.DashboardActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Face capture mode used by the `face/{mode}` route. */
const val FACE_MODE_CHECK = "check"

/**
 * Descriptor handed back from [FaceScreen] to whoever opened it. Navigation drops the
 * screen's own state, so the result waits here until the home screen picks it up.
 */
data class FaceResult(val payloadJson: String, val image: String, val mode: String)

object FaceResultBus {
    var pending by mutableStateOf<FaceResult?>(null)

    fun take(): FaceResult? {
        val value = pending
        pending = null
        return value
    }
}

/**
 * CameraX + ML Kit face capture. The JPEG goes to `POST /api/face/describe`, which returns
 * the same face-api 128-d descriptor the web app produces — no WebView involved.
 * `check` mode stops after the capture and only reports whether the camera works.
 */
@ExperimentalGetImage
@Composable
fun FaceScreen(
    mode: String,
    onBack: () -> Unit,
    onFinished: (descriptorJson: String, imageDataUrl: String, mode: String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val selfTest = mode == FACE_MODE_CHECK

    var hasCamera by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var faceCount by remember { mutableStateOf(0) }
    var status by remember { mutableStateOf("Point the front camera at your face.") }
    var capturedBytes by remember { mutableStateOf(0) }
    var busy by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCamera = granted
        if (!granted) status = "Camera permission is required for face capture."
    }

    LaunchedEffect(Unit) {
        if (!hasCamera) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    val analysisExecutor: ExecutorService = remember { Executors.newSingleThreadExecutor() }
    val imageCapture = remember {
        ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .build()
    }
    val detector = remember {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setMinFaceSize(0.25f)
                .build()
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            analysisExecutor.shutdown()
            detector.close()
        }
    }

    /** Sends the JPEG to the server and hands the descriptor back to the caller. */
    fun describeAndFinish(dataUrl: String) {
        busy = true
        status = "Matching face…"
        scope.launch {
            try {
                val payload = withContext(Dispatchers.IO) {
                    val res = ApiClient(context).describeFace(dataUrl)
                    val descriptor = res.optJSONArray("descriptor")
                        ?: throw IllegalStateException("No face found in the photo. Try again.")
                    val samples = res.optJSONArray("samples") ?: JSONArray().put(descriptor)
                    JSONObject()
                        .put("descriptor", descriptor)
                        .put("samples", samples)
                        .toString()
                }
                onFinished(payload, dataUrl, mode)
            } catch (e: Exception) {
                status = errorText(e, "Could not read your face. Try again.")
            } finally {
                busy = false
            }
        }
    }

    fun capture() {
        if (faceCount != 1) {
            status = "Get exactly one face in the frame first."
            return
        }
        busy = true
        status = "Capturing…"
        imageCapture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val dataUrl = try {
                        toJpegDataUrl(image)
                    } catch (e: Exception) {
                        status = errorText(e, "Could not read the captured photo")
                        busy = false
                        null
                    } finally {
                        image.close()
                    }
                    if (dataUrl == null) return
                    capturedBytes = dataUrl.length
                    if (selfTest) {
                        busy = false
                        status = "Camera and face detection are working " +
                            "(${dataUrl.length} chars encoded)."
                    } else {
                        describeAndFinish(dataUrl)
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    busy = false
                    status = errorText(exception, "Capture failed")
                }
            }
        )
    }

    AapScreenScaffold(
        title = faceTitle(mode),
        subtitle = faceSubtitle(mode),
        onBack = onBack
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .clip(RoundedCornerShape(28.dp)),
                color = AapColors.NavyCard
            ) {
                if (!hasCamera) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Filled.Face, null, Modifier.size(44.dp), tint = AapColors.Yellow)
                            Spacer(Modifier.height(12.dp))
                            Text(
                                "Camera permission needed",
                                style = MaterialTheme.typography.titleMedium,
                                color = AapColors.TextPrimary
                            )
                        }
                    }
                } else {
                    AndroidView(
                        modifier = Modifier.fillMaxSize(),
                        factory = { ctx ->
                            val previewView = PreviewView(ctx).apply {
                                scaleType = PreviewView.ScaleType.FILL_CENTER
                            }
                            val providerFuture = ProcessCameraProvider.getInstance(ctx)
                            providerFuture.addListener({
                                try {
                                    val provider = providerFuture.get()
                                    val preview = Preview.Builder().build().also {
                                        it.setSurfaceProvider(previewView.surfaceProvider)
                                    }
                                    val analysis = ImageAnalysis.Builder()
                                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                        .build()
                                    analysis.setAnalyzer(analysisExecutor) { proxy: ImageProxy ->
                                        val media = proxy.image
                                        if (media == null) {
                                            proxy.close()
                                        } else {
                                            val input = InputImage.fromMediaImage(
                                                media,
                                                proxy.imageInfo.rotationDegrees
                                            )
                                            detector.process(input)
                                                .addOnSuccessListener { faces -> faceCount = faces.size }
                                                .addOnCompleteListener { proxy.close() }
                                        }
                                    }
                                    provider.unbindAll()
                                    provider.bindToLifecycle(
                                        lifecycleOwner,
                                        CameraSelector.DEFAULT_FRONT_CAMERA,
                                        preview,
                                        analysis,
                                        imageCapture
                                    )
                                } catch (e: Exception) {
                                    status = errorText(e, "Could not start the camera")
                                }
                            }, ContextCompat.getMainExecutor(ctx))
                            previewView
                        }
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(10.dp)
                        .clip(RoundedCornerShape(50))
                        .background(if (faceCount > 0) AapColors.Success else AapColors.TextMuted)
                )
                Spacer(Modifier.size(10.dp))
                Text(
                    when {
                        !hasCamera -> "Camera off"
                        faceCount == 1 -> "Face detected — hold still"
                        faceCount > 1 -> "More than one face in frame"
                        else -> "No face detected"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = if (faceCount == 1) AapColors.Success else AapColors.TextMuted
                )
            }

            Spacer(Modifier.height(6.dp))
            Text(status, style = MaterialTheme.typography.bodyMedium, color = AapColors.TextMuted)
            if (selfTest && capturedBytes > 0) {
                Text(
                    "Captured ~${capturedBytes / 1024} KB of base64 JPEG",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AapColors.Yellow
                )
            }

            Spacer(Modifier.height(14.dp))

            Button(
                onClick = { capture() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(58.dp),
                enabled = hasCamera && !busy,
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AapColors.Yellow,
                    contentColor = AapColors.Navy,
                    disabledContainerColor = AapColors.Yellow.copy(alpha = 0.5f),
                    disabledContentColor = AapColors.Navy.copy(alpha = 0.6f)
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 10.dp)
            ) {
                if (busy) {
                    CircularProgressIndicator(
                        Modifier.size(22.dp),
                        color = AapColors.Navy,
                        strokeWidth = 3.dp
                    )
                } else {
                    Icon(Icons.Filled.CameraAlt, null, Modifier.size(22.dp))
                    Spacer(Modifier.size(10.dp))
                    Text(faceButtonText(mode), fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(22.dp))
        }
    }
}

private fun faceTitle(mode: String): String = when (mode) {
    DashboardActivity.MODE_REGISTER -> "Register face"
    DashboardActivity.MODE_PUNCH_IN -> "Punch in"
    DashboardActivity.MODE_PUNCH_OUT -> "Punch out"
    else -> "Face check"
}

private fun faceSubtitle(mode: String): String = when (mode) {
    DashboardActivity.MODE_REGISTER -> "One-time face setup"
    DashboardActivity.MODE_PUNCH_IN, DashboardActivity.MODE_PUNCH_OUT -> "Verify it is you"
    else -> "Camera + face detection self-test"
}

private fun faceButtonText(mode: String): String = when (mode) {
    DashboardActivity.MODE_REGISTER -> "Register"
    DashboardActivity.MODE_PUNCH_IN, DashboardActivity.MODE_PUNCH_OUT -> "Confirm punch"
    else -> "Capture"
}

/**
 * Full-res captures are several MB of base64, and the server ignores EXIF, so the frame is
 * rotated upright and shrunk before it goes over the wire.
 */
private fun toJpegDataUrl(image: ImageProxy): String {
    val buffer = image.planes[0].buffer
    val bytes = ByteArray(buffer.remaining())
    buffer.get(bytes)
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: throw IllegalStateException("Could not decode the captured photo.")

    val matrix = Matrix()
    val longestSide = maxOf(decoded.width, decoded.height)
    if (longestSide > MAX_CAPTURE_SIDE) {
        val scale = MAX_CAPTURE_SIDE.toFloat() / longestSide.toFloat()
        matrix.postScale(scale, scale)
    }
    val rotation = image.imageInfo.rotationDegrees
    if (rotation != 0) matrix.postRotate(rotation.toFloat())

    val upright = if (matrix.isIdentity) {
        decoded
    } else {
        Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    }

    val out = ByteArrayOutputStream()
    upright.compress(Bitmap.CompressFormat.JPEG, 88, out)
    if (upright !== decoded) upright.recycle()
    decoded.recycle()
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

private const val MAX_CAPTURE_SIDE = 720
