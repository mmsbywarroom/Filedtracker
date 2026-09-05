package `in`.videh.filedtracker.nativeapp.compose

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import `in`.videh.filedtracker.bglocation.FieldLocationService
import `in`.videh.filedtracker.nativeapp.ApiClient
import `in`.videh.filedtracker.nativeapp.DashboardActivity
import `in`.videh.filedtracker.nativeapp.FaceCaptureActivity
import `in`.videh.filedtracker.nativeapp.LocationHelper
import `in`.videh.filedtracker.nativeapp.PunchLocationSampler
import `in`.videh.filedtracker.nativeapp.SecurityHelper
import `in`.videh.filedtracker.nativeapp.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native home → on-device face-api (FaceCaptureActivity) → punch/register API.
 * No server /api/face/describe — same speed as the website.
 */
@Composable
fun FastFacePunchScreen(
    mode: String,
    onBack: () -> Unit,
    onSuccess: () -> Unit
) {
    if (mode == FACE_MODE_CHECK) {
        @OptIn(androidx.camera.core.ExperimentalGetImage::class)
        FaceScreen(mode = mode, onBack = onBack, onSuccess = onSuccess)
        return
    }

    val context = LocalContext.current
    val activity = context.findActivity()
    val scope = rememberCoroutineScope()
    var status by remember { mutableStateOf("Opening camera…") }
    var error by remember { mutableStateOf("") }
    var launched by remember { mutableStateOf(false) }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            onBack()
            return@rememberLauncherForActivityResult
        }
        val payloadJson = result.data!!.getStringExtra(FaceCaptureActivity.EXTRA_DESCRIPTOR_JSON)
        val image = result.data!!.getStringExtra(FaceCaptureActivity.EXTRA_IMAGE)
        val faceMode = result.data!!.getStringExtra(FaceCaptureActivity.EXTRA_MODE) ?: mode
        if (payloadJson.isNullOrBlank() || image.isNullOrBlank()) {
            error = "Face data missing. Try again."
            return@rememberLauncherForActivityResult
        }
        scope.launch {
            try {
                completeFaceAction(context, activity, faceMode, payloadJson, image) { status = it }
                onSuccess()
            } catch (e: Exception) {
                error = errorText(e, "Could not finish punch")
                status = ""
            }
        }
    }

    LaunchedEffect(Unit) {
        if (launched) return@LaunchedEffect
        launched = true
        val i = Intent(context, FaceCaptureActivity::class.java)
        i.putExtra(FaceCaptureActivity.EXTRA_MODE, mode)
        launcher.launch(i)
    }

    AapScreenScaffold(
        title = when (mode) {
            DashboardActivity.MODE_REGISTER -> "Register face"
            DashboardActivity.MODE_PUNCH_OUT -> "Punch out"
            else -> "Punch in"
        },
        subtitle = "On-device face match",
        onBack = onBack
    ) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                if (error.isBlank()) {
                    CircularProgressIndicator(color = AapColors.Yellow)
                    Spacer(Modifier.height(16.dp))
                }
                Text(
                    error.ifBlank { status },
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (error.isNotBlank()) AapColors.Danger else AapColors.TextMuted,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth()
                )
                if (error.isNotBlank()) {
                    Spacer(Modifier.height(16.dp))
                    TextButton(onClick = {
                        error = ""
                        status = "Opening camera…"
                        launched = false
                        val i = Intent(context, FaceCaptureActivity::class.java)
                        i.putExtra(FaceCaptureActivity.EXTRA_MODE, mode)
                        launcher.launch(i)
                        launched = true
                    }) {
                        Text("Try again", color = AapColors.Yellow)
                    }
                }
            }
        }
    }
}

private suspend fun completeFaceAction(
    context: android.content.Context,
    activity: Activity?,
    mode: String,
    payloadJson: String,
    image: String,
    setStatus: (String) -> Unit
) {
    val api = ApiClient(context)
    when (mode) {
        DashboardActivity.MODE_REGISTER -> {
            setStatus("Saving face…")
            val (descriptor, samples) = parseFacePayload(payloadJson)
            withContext(Dispatchers.IO) {
                api.registerFace(descriptor, samples, image, true)
            }
            HomeDashboardCache.markFaceRegistered()
            setStatus("Face registered.")
        }
        DashboardActivity.MODE_PUNCH_IN, DashboardActivity.MODE_PUNCH_OUT -> {
            setStatus(if (mode == DashboardActivity.MODE_PUNCH_IN) "Punching in…" else "Punching out…")
            val descriptor = parseDescriptorOnly(payloadJson)
            val act = activity ?: throw IllegalStateException("App is not ready.")
            val loc = withContext(Dispatchers.IO) { awaitLocation(act) }
            try {
                SecurityHelper.assertSecureForPunch(context, loc)
            } catch (_: Exception) {
            }
            val res = withContext(Dispatchers.IO) {
                if (mode == DashboardActivity.MODE_PUNCH_IN) {
                    api.punchIn(loc.latitude, loc.longitude, loc.accuracy.toDouble(), descriptor, image)
                } else {
                    api.punchOut(loc.latitude, loc.longitude, loc.accuracy.toDouble(), descriptor, image)
                }
            }
            if (mode == DashboardActivity.MODE_PUNCH_IN) {
                val att = res.optJSONObject("attendance")
                HomeDashboardCache.applyPunchIn(att)
                val punchInAt = att?.optString("punchInAt", "").orEmpty()
                val attendanceId = att?.optString("id", "").orEmpty()
                // Silent integrity multi-sample — never shown to employee, never blocks punch.
                try {
                    PunchLocationSampler.captureAfterPunch(
                        context,
                        DashboardActivity.MODE_PUNCH_IN,
                        attendanceId
                    )
                } catch (_: Exception) {
                }
                if (punchInAt.isNotBlank()) {
                    withContext(Dispatchers.IO) {
                        FieldLocationService.start(
                            context,
                            SessionStore.apiBase(context),
                            SessionStore.token(context),
                            punchInAt,
                            attendanceId
                        )
                    }
                    try {
                        LocationHelper.requestBackgroundLocation(act)
                    } catch (_: Exception) {
                    }
                }
                setStatus("Punched in.")
            } else {
                val attendanceId = HomeDashboardCache.openSession?.optString("id", "").orEmpty()
                try {
                    PunchLocationSampler.captureAfterPunch(
                        context,
                        DashboardActivity.MODE_PUNCH_OUT,
                        attendanceId
                    )
                } catch (_: Exception) {
                }
                HomeDashboardCache.applyPunchOut()
                withContext(Dispatchers.IO) { FieldLocationService.stop(context) }
                setStatus("Punched out.")
            }
        }
        else -> Unit
    }
}

private fun parseFacePayload(payloadJson: String): Pair<JSONArray, JSONArray> {
    val trimmed = payloadJson.trim()
    return if (trimmed.startsWith("{")) {
        val o = JSONObject(trimmed)
        val descriptor = o.getJSONArray("descriptor")
        val samples = o.optJSONArray("samples") ?: JSONArray().put(descriptor)
        descriptor to samples
    } else {
        val descriptor = JSONArray(trimmed)
        descriptor to JSONArray().put(descriptor)
    }
}

private fun parseDescriptorOnly(payloadJson: String): JSONArray {
    val trimmed = payloadJson.trim()
    return if (trimmed.startsWith("{")) {
        JSONObject(trimmed).getJSONArray("descriptor")
    } else {
        JSONArray(trimmed)
    }
}
