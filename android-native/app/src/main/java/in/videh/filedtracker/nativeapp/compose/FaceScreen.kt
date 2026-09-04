package `in`.videh.filedtracker.nativeapp.compose

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.location.Location
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
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Face capture mode used by the `face/{mode}` route. */
const val FACE_MODE_CHECK = "check"

/**
 * CameraX + ML Kit. Like the web app: hold still → green frame → auto capture.
 * Punch / register finish on THIS screen — camera closes only on success; errors stay here.
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
    val needHits = if (mode == DashboardActivity.MODE_REGISTER) 3 else 2

    var hasCamera by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var faceCount by remember { mutableIntStateOf(0) }
    var goodHits by remember { mutableIntStateOf(0) }
    var status by remember { mutableStateOf("Point the front camera at your face.") }
    var statusError by remember { mutableStateOf(false) }
    var capturedBytes by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var autoFired by remember { mutableStateOf(false) }
    var cachedLoc by remember { mutableStateOf<Location?>(null) }

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
            val loc = awaitLocation(act)
            SecurityHelper.assertSecureForPunch(context, loc)
            cachedLoc = loc
        } catch (e: Exception) {
            setStatus(errorText(e, "Could not verify GPS location."), true)
        }
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

    fun resetForRetry() {
        busy = false
        autoFired = false
        goodHits = 0
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
                                    "Hold still with your full face in the frame for a few seconds, then try again."
                                )
                            val samples = res.optJSONArray("samples") ?: JSONArray().put(descriptor)
                            descriptor to samples
                        }
                        setStatus("Saving face…")
                        withContext(Dispatchers.IO) {
                            api.registerFace(payload.first, payload.second, dataUrl, false)
                        }
                        setStatus("Face registered.")
                        onSuccess()
                    }

                    DashboardActivity.MODE_PUNCH_IN, DashboardActivity.MODE_PUNCH_OUT -> {
                        setStatus(
                            if (mode == DashboardActivity.MODE_PUNCH_IN) "Punching in…"
                            else "Punching out…"
                        )
                        val describeJob = async(Dispatchers.IO) {
                            val res = api.describeFace(dataUrl)
                            val descriptor = res.optJSONArray("descriptor")
                                ?: throw IllegalStateException(
                                    "Hold still with your full face in the frame for a few seconds, then try again."
                                )
                            descriptor
                        }
                        val locJob = async(Dispatchers.IO) {
                            val loc = cachedLoc ?: awaitLocation(act)
                            SecurityHelper.assertSecureForPunch(context, loc)
                            loc
                        }
                        val descriptor = describeJob.await()
                        val loc = locJob.await()
                        cachedLoc = loc

                        val res = withContext(Dispatchers.IO) {
                            if (mode == DashboardActivity.MODE_PUNCH_IN) {
                                api.punchIn(
                                    loc.latitude,
                                    loc.longitude,
                                    loc.accuracy.toDouble(),
                                    descriptor,
                                    dataUrl
                                )
                            } else {
                                api.punchOut(
                                    loc.latitude,
                                    loc.longitude,
                                    loc.accuracy.toDouble(),
                                    descriptor,
                                    dataUrl
                                )
                            }
                        }

                        if (mode == DashboardActivity.MODE_PUNCH_IN) {
                            val punchInAt =
                                res.optJSONObject("attendance")?.optString("punchInAt", "").orEmpty()
                            if (punchInAt.isNotBlank()) {
                                FieldLocationService.start(
                                    context,
                                    SessionStore.apiBase(context),
                                    SessionStore.token(context),
                                    punchInAt
                                )
                                LocationHelper.requestBackgroundLocation(act)
                            }
                            setStatus("Punched in.")
                        } else {
                            FieldLocationService.stop(context)
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

    fun capture() {
        if (faceCount != 1) {
            setStatus("Get exactly one face in the frame first.", true)
            return
        }
        if (busy) return
        busy = true
        statusError = false
        setStatus("Capturing…")
        imageCapture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val dataUrl = try {
                        toJpegDataUrl(image)
                    } catch (e: Exception) {
                        setStatus(errorText(e, "Could not read the captured photo"), true)
                        resetForRetry()
                        null
                    } finally {
                        image.close()
                    }
                    if (dataUrl == null) return
                    capturedBytes = dataUrl.length
                    if (selfTest) {
                        busy = false
                        setStatus(
                            "Camera and face detection are working " +
                                "(${dataUrl.length} chars encoded)."
                        )
                        autoFired = false
                    } else {
                        completeAfterCapture(dataUrl)
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    setStatus(errorText(exception, "Capture failed"), true)
                    resetForRetry()
                }
            }
        )
    }

    LaunchedEffect(goodHits, busy, autoFired, hasCamera) {
        if (!autoPunch || !hasCamera || busy || autoFired) return@LaunchedEffect
        if (goodHits >= needHits) {
            autoFired = true
            capture()
        }
    }

    val locked = faceCount == 1
    val frameColor = when {
        statusError -> AapColors.Danger
        busy -> AapColors.Yellow
        locked -> AapColors.Success
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
                                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                            .build()
                                        analysis.setAnalyzer(analysisExecutor) { proxy: ImageProxy ->
                                            if (busy) {
                                                proxy.close()
                                                return@setAnalyzer
                                            }
                                            val media = proxy.image
                                            if (media == null) {
                                                proxy.close()
                                            } else {
                                                val input = InputImage.fromMediaImage(
                                                    media,
                                                    proxy.imageInfo.rotationDegrees
                                                )
                                                detector.process(input)
                                                    .addOnSuccessListener(mainExecutor) { faces ->
                                                        val count = faces.size
                                                        faceCount = count
                                                        if (count == 1) {
                                                            goodHits += 1
                                                        } else {
                                                            goodHits = 0
                                                        }
                                                    }
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
                                        setStatus(errorText(e, "Could not start the camera"), true)
                                    }
                                }, mainExecutor)
                                previewView
                            }
                        )

                        Box(
                            Modifier
                                .align(Alignment.Center)
                                .size(220.dp)
                                .border(
                                    width = if (locked) 4.dp else 2.dp,
                                    color = when {
                                        statusError -> AapColors.Danger
                                        locked -> AapColors.Success
                                        else -> AapColors.TextMuted.copy(alpha = 0.45f)
                                    },
                                    shape = RoundedCornerShape(16.dp)
                                )
                        )
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
                                locked -> AapColors.Success
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
                        locked -> AapColors.Success
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
                        autoFired = false
                        goodHits = 0
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
    upright.compress(Bitmap.CompressFormat.JPEG, 78, out)
    if (upright !== decoded) upright.recycle()
    decoded.recycle()
    return "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}

private const val MAX_CAPTURE_SIDE = 640
