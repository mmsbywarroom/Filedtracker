package `in`.videh.filedtracker.nativeapp.compose

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.YuvImage
import android.location.Location
import android.util.Base64
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import `in`.videh.filedtracker.bglocation.FieldLocationService
import `in`.videh.filedtracker.nativeapp.ApiClient
import `in`.videh.filedtracker.nativeapp.DashboardActivity
import `in`.videh.filedtracker.nativeapp.LocationHelper
import `in`.videh.filedtracker.nativeapp.R
import `in`.videh.filedtracker.nativeapp.SecurityHelper
import `in`.videh.filedtracker.nativeapp.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Face capture mode used by the `face/{mode}` route. */
const val FACE_MODE_CHECK = "check"

/**
 * CameraX + ML Kit. Outer frame only (no inner box) — turns green when face is locked,
 * then auto-punches from the live analysis frame (no second takePicture = fewer crashes).
 * Punch uses one server round-trip (image → describe + match registered face).
 */
@ExperimentalGetImage
@Composable
fun FaceScreen(
    mode: String,
    onBack: () -> Unit,
    onSuccess: () -> Unit
) {
    val context = LocalContext.current
    val activity = context.findActivity()
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val selfTest = mode == FACE_MODE_CHECK
    val isPunch =
        mode == DashboardActivity.MODE_PUNCH_IN || mode == DashboardActivity.MODE_PUNCH_OUT
    val autoPunch = !selfTest
    // ~2 stable frames (~100–200ms) then snap — feels like face unlock.
    val needHits = if (mode == DashboardActivity.MODE_REGISTER) 3 else 2

    var hasCamera by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var faceCount by remember { mutableIntStateOf(0) }
    var locked by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf("Point the front camera at your face.") }
    var statusError by remember { mutableStateOf(false) }
    var capturedBytes by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var cachedLoc by remember { mutableStateOf<Location?>(null) }

    val goodHits = remember { AtomicInteger(0) }
    val captureArmed = remember { AtomicBoolean(false) }
    val capturing = remember { AtomicBoolean(false) }

    fun setStatus(text: String, error: Boolean = false) {
        status = text
        statusError = error
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCamera = granted
        if (!granted) setStatus("Camera permission is required for face capture.", true)
    }

    LaunchedEffect(Unit) {
        if (!hasCamera) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    // Warm GPS while the user lines up their face (punch only).
    LaunchedEffect(mode) {
        if (!isPunch) return@LaunchedEffect
        val act = activity ?: return@LaunchedEffect
        try {
            val loc = withContext(Dispatchers.IO) { awaitLocation(act) }
            try {
                SecurityHelper.assertSecureForPunch(context, loc)
            } catch (_: Exception) {
            }
            cachedLoc = loc
        } catch (_: Exception) {
        }
    }

    val analysisExecutor: ExecutorService = remember { Executors.newSingleThreadExecutor() }
    val detector = remember {
        FaceDetection.getClient(
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                .setMinFaceSize(0.2f)
                .build()
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            analysisExecutor.shutdown()
            detector.close()
        }
    }

    fun resetForRetry() {
        busy = false
        locked = false
        goodHits.set(0)
        captureArmed.set(false)
        capturing.set(false)
    }

    fun completeAfterCapture(dataUrl: String) {
        busy = true
        statusError = false
        scope.launch {
            try {
                val act = activity ?: throw IllegalStateException("App is not ready.")
                val api = ApiClient(context)

                when (mode) {
                    DashboardActivity.MODE_REGISTER -> {
                        setStatus("Matching face…")
                        val payload = withContext(Dispatchers.IO) {
                            val res = api.describeFace(dataUrl)
                            val descriptor = res.optJSONArray("descriptor")
                                ?: throw IllegalStateException(
                                    "Hold still — eyes, nose and chin clearly in the frame, then try again."
                                )
                            val samples = res.optJSONArray("samples") ?: JSONArray().put(descriptor)
                            descriptor to samples
                        }
                        setStatus("Saving face…")
                        withContext(Dispatchers.IO) {
                            api.registerFace(payload.first, payload.second, dataUrl, true)
                        }
                        setStatus("Face registered.")
                        onSuccess()
                    }

                    DashboardActivity.MODE_PUNCH_IN, DashboardActivity.MODE_PUNCH_OUT -> {
                        setStatus(
                            if (mode == DashboardActivity.MODE_PUNCH_IN) "Punching in…"
                            else "Punching out…"
                        )
                        // One round-trip: server describes photo + matches registered face.
                        val loc = withContext(Dispatchers.IO) {
                            val warm = cachedLoc ?: awaitLocation(act)
                            try {
                                SecurityHelper.assertSecureForPunch(context, warm)
                            } catch (_: Exception) {
                            }
                            warm
                        }
                        cachedLoc = loc

                        val res = withContext(Dispatchers.IO) {
                            if (mode == DashboardActivity.MODE_PUNCH_IN) {
                                api.punchIn(
                                    loc.latitude,
                                    loc.longitude,
                                    loc.accuracy.toDouble(),
                                    null,
                                    dataUrl
                                )
                            } else {
                                api.punchOut(
                                    loc.latitude,
                                    loc.longitude,
                                    loc.accuracy.toDouble(),
                                    null,
                                    dataUrl
                                )
                            }
                        }

                        if (mode == DashboardActivity.MODE_PUNCH_IN) {
                            val punchInAt =
                                res.optJSONObject("attendance")?.optString("punchInAt", "").orEmpty()
                            if (punchInAt.isNotBlank()) {
                                withContext(Dispatchers.IO) {
                                    FieldLocationService.start(
                                        context,
                                        SessionStore.apiBase(context),
                                        SessionStore.token(context),
                                        punchInAt
                                    )
                                }
                                try {
                                    LocationHelper.requestBackgroundLocation(act)
                                } catch (_: Exception) {
                                }
                            }
                            setStatus("Punched in.")
                        } else {
                            withContext(Dispatchers.IO) {
                                FieldLocationService.stop(context)
                            }
                            setStatus("Punched out.")
                        }
                        onSuccess()
                    }

                    else -> {
                        setStatus("Camera and face detection are working.")
                        resetForRetry()
                    }
                }
            } catch (e: Exception) {
                setStatus(errorText(e, "Could not complete. Try again."), true)
                resetForRetry()
            }
        }
    }

    fun armCaptureFromFrame() {
        if (capturing.get() || busy) return
        if (!capturing.compareAndSet(false, true)) return
        busy = true
        locked = true
        statusError = false
        setStatus("Capturing…")
        captureArmed.set(true)
    }

    /** Manual capture (self-test only) — arms next analysis frame. */
    fun capture() {
        if (faceCount != 1) {
            setStatus("Get exactly one face in the frame first.", true)
            return
        }
        armCaptureFromFrame()
    }

    val frameColor = when {
        statusError -> AapColors.Danger
        locked || busy -> AapColors.Success
        else -> AapColors.Outline
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
                    .clip(RoundedCornerShape(28.dp))
                    .border(4.dp, frameColor, RoundedCornerShape(28.dp)),
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
                    Box(Modifier.fillMaxSize()) {
                        AndroidView(
                            modifier = Modifier.fillMaxSize(),
                            factory = { ctx ->
                                val previewView = PreviewView(ctx).apply {
                                    scaleType = PreviewView.ScaleType.FILL_CENTER
                                }
                                val mainExecutor = ContextCompat.getMainExecutor(ctx)
                                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                                providerFuture.addListener({
                                    try {
                                        val provider = providerFuture.get()
                                        val preview = Preview.Builder().build().also {
                                            it.setSurfaceProvider(previewView.surfaceProvider)
                                        }
                                        val analysis = ImageAnalysis.Builder()
                                            .setTargetResolution(Size(480, 640))
                                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                            .build()
                                        analysis.setAnalyzer(analysisExecutor) { proxy: ImageProxy ->
                                            try {
                                                if (captureArmed.compareAndSet(true, false)) {
                                                    val dataUrl = try {
                                                        imageProxyToJpegDataUrl(proxy)
                                                    } catch (e: Exception) {
                                                        proxy.close()
                                                        mainExecutor.execute {
                                                            setStatus(
                                                                errorText(e, "Could not read the captured photo"),
                                                                true
                                                            )
                                                            resetForRetry()
                                                        }
                                                        return@setAnalyzer
                                                    }
                                                    proxy.close()
                                                    mainExecutor.execute {
                                                        capturedBytes = dataUrl.length
                                                        if (selfTest) {
                                                            busy = false
                                                            capturing.set(false)
                                                            captureArmed.set(false)
                                                            setStatus("Camera OK.")
                                                        } else {
                                                            completeAfterCapture(dataUrl)
                                                        }
                                                    }
                                                    return@setAnalyzer
                                                }

                                                if (busy || capturing.get()) {
                                                    proxy.close()
                                                    return@setAnalyzer
                                                }

                                                val media = proxy.image
                                                if (media == null) {
                                                    proxy.close()
                                                    return@setAnalyzer
                                                }
                                                val input = InputImage.fromMediaImage(
                                                    media,
                                                    proxy.imageInfo.rotationDegrees
                                                )
                                                detector.process(input)
                                                    .addOnSuccessListener(mainExecutor) { faces ->
                                                        val count = faces.size
                                                        if (faceCount != count) faceCount = count
                                                        val isLocked = count == 1
                                                        if (locked != isLocked && !busy) locked = isLocked
                                                        if (isLocked) {
                                                            val hits = goodHits.incrementAndGet()
                                                            if (autoPunch && hits >= needHits) {
                                                                armCaptureFromFrame()
                                                            }
                                                        } else {
                                                            goodHits.set(0)
                                                        }
                                                    }
                                                    .addOnCompleteListener {
                                                        try {
                                                            proxy.close()
                                                        } catch (_: Exception) {
                                                        }
                                                    }
                                            } catch (e: Exception) {
                                                try {
                                                    proxy.close()
                                                } catch (_: Exception) {
                                                }
                                                mainExecutor.execute {
                                                    if (!busy) {
                                                        setStatus(errorText(e, "Camera frame error"), true)
                                                    }
                                                }
                                            }
                                        }
                                        provider.unbindAll()
                                        provider.bindToLifecycle(
                                            lifecycleOwner,
                                            CameraSelector.DEFAULT_FRONT_CAMERA,
                                            preview,
                                            analysis
                                        )
                                    } catch (e: Exception) {
                                        setStatus(errorText(e, "Could not start the camera"), true)
                                    }
                                }, mainExecutor)
                                previewView
                            }
                        )
                        // Outer frame only — no inner guide box (user request).
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            val liveHint = when {
                !hasCamera -> "Camera off"
                busy -> status
                statusError -> status
                locked && autoPunch -> stringResource(R.string.hold_still)
                locked -> "Face detected — hold still"
                faceCount > 1 -> "More than one face in frame"
                else -> stringResource(R.string.face_detecting)
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(10.dp)
                        .clip(RoundedCornerShape(50))
                        .background(
                            when {
                                statusError -> AapColors.Danger
                                locked || busy -> AapColors.Success
                                else -> AapColors.TextMuted
                            }
                        )
                )
                Spacer(Modifier.size(10.dp))
                Text(
                    liveHint,
                    style = MaterialTheme.typography.titleMedium,
                    color = when {
                        statusError -> AapColors.Danger
                        locked || busy -> AapColors.Success
                        else -> AapColors.TextMuted
                    }
                )
            }

            Spacer(Modifier.height(6.dp))
            Text(
                if (statusError || busy || selfTest) status
                else stringResource(R.string.face_auto_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = if (statusError) AapColors.Danger else AapColors.TextMuted
            )
            if (selfTest && capturedBytes > 0) {
                Text(
                    "Captured ~${capturedBytes / 1024} KB of base64 JPEG",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AapColors.Yellow
                )
            }

            Spacer(Modifier.height(14.dp))

            if (selfTest) {
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
                        Text("Capture", fontWeight = FontWeight.Bold)
                    }
                }
            } else if (busy) {
                Box(Modifier.fillMaxWidth().height(58.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AapColors.Yellow, strokeWidth = 3.dp)
                }
            } else if (statusError) {
                Button(
                    onClick = {
                        statusError = false
                        setStatus("Point the front camera at your face.")
                        resetForRetry()
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(58.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = AapColors.Yellow,
                        contentColor = AapColors.Navy
                    )
                ) {
                    Text("Try again", fontWeight = FontWeight.Bold)
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
    DashboardActivity.MODE_PUNCH_IN, DashboardActivity.MODE_PUNCH_OUT -> "Hold still — auto punch"
    else -> "Camera + face detection self-test"
}

/**
 * Encode analysis / capture frame to a small JPEG data URL.
 * Handles JPEG and YUV_420_888; scales down to avoid OOM on low-end phones.
 */
@ExperimentalGetImage
private fun imageProxyToJpegDataUrl(image: ImageProxy): String {
    val rotation = image.imageInfo.rotationDegrees
    val decoded = when (image.format) {
        ImageFormat.JPEG -> {
            val buffer = image.planes[0].buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: throw IllegalStateException("Could not decode the captured photo.")
        }
        ImageFormat.YUV_420_888 -> yuv420888ToBitmap(image)
        else -> throw IllegalStateException("Unsupported camera format ${image.format}")
    }

    val matrix = Matrix()
    val longestSide = maxOf(decoded.width, decoded.height)
    if (longestSide > MAX_CAPTURE_SIDE) {
        val scale = MAX_CAPTURE_SIDE.toFloat() / longestSide.toFloat()
        matrix.postScale(scale, scale)
    }
    if (rotation != 0) matrix.postRotate(rotation.toFloat())

    val upright = if (matrix.isIdentity) {
        decoded
    } else {
        Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    }

    val out = ByteArrayOutputStream()
    upright.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
    if (upright !== decoded) upright.recycle()
    decoded.recycle()
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

/** Convert CameraX YUV_420_888 → Bitmap via NV21 + YuvImage (crash-safe path). */
private fun yuv420888ToBitmap(image: ImageProxy): Bitmap {
    val nv21 = yuv420888ToNv21(image)
    val yuv = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
    val out = ByteArrayOutputStream()
    if (!yuv.compressToJpeg(Rect(0, 0, image.width, image.height), 80, out)) {
        throw IllegalStateException("Could not compress camera frame.")
    }
    val bytes = out.toByteArray()
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        ?: throw IllegalStateException("Could not decode camera frame.")
}

private fun yuv420888ToNv21(image: ImageProxy): ByteArray {
    val width = image.width
    val height = image.height
    val yPlane = image.planes[0]
    val uPlane = image.planes[1]
    val vPlane = image.planes[2]
    val ySize = width * height
    val nv21 = ByteArray(ySize + ySize / 2)

    val yBuffer = yPlane.buffer
    val yRowStride = yPlane.rowStride
    var pos = 0
    if (yRowStride == width) {
        yBuffer.get(nv21, 0, ySize)
        pos = ySize
    } else {
        var rowStart = 0
        for (row in 0 until height) {
            yBuffer.position(rowStart)
            yBuffer.get(nv21, pos, width)
            pos += width
            rowStart += yRowStride
        }
    }

    val chromaHeight = height / 2
    val chromaWidth = width / 2
    val vBuffer = vPlane.buffer
    val uBuffer = uPlane.buffer
    val vRowStride = vPlane.rowStride
    val uRowStride = uPlane.rowStride
    val vPixelStride = vPlane.pixelStride
    val uPixelStride = uPlane.pixelStride

    // NV21 = YYYY… + VUVU…
    for (row in 0 until chromaHeight) {
        for (col in 0 until chromaWidth) {
            val vIndex = row * vRowStride + col * vPixelStride
            val uIndex = row * uRowStride + col * uPixelStride
            nv21[pos++] = vBuffer.get(vIndex)
            nv21[pos++] = uBuffer.get(uIndex)
        }
    }
    return nv21
}

private const val MAX_CAPTURE_SIDE = 360
private const val JPEG_QUALITY = 55
