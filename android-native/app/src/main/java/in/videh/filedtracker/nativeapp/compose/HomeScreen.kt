package `in`.videh.filedtracker.nativeapp.compose

import android.Manifest
import android.location.Location
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.EventAvailable
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import `in`.videh.filedtracker.bglocation.FieldLocationService
import `in`.videh.filedtracker.nativeapp.ApiClient
import `in`.videh.filedtracker.nativeapp.DashboardActivity
import `in`.videh.filedtracker.nativeapp.LocaleHelper
import `in`.videh.filedtracker.nativeapp.LocationHelper
import `in`.videh.filedtracker.nativeapp.R
import `in`.videh.filedtracker.nativeapp.SecurityHelper
import `in`.videh.filedtracker.nativeapp.SecurityReporter
import `in`.videh.filedtracker.nativeapp.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

@Composable
fun HomeScreen(
    onOpen: (String) -> Unit,
    onLoggedOut: () -> Unit
) {
    val context = LocalContext.current
    val activity = context.findActivity()
    val scope = rememberCoroutineScope()
    val lifecycleOwner = LocalLifecycleOwner.current

    var user by remember { mutableStateOf<JSONObject?>(null) }
    var openSession by remember { mutableStateOf<JSONObject?>(null) }
    var todayDistance by remember { mutableStateOf(0.0) }
    var todayHours by remember { mutableStateOf(0.0) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }
    var gpsText by remember { mutableStateOf("") }
    var reloadKey by remember { mutableStateOf(0) }

    val faceRegistered = user?.stringOrNull("faceRegisteredAt") != null
    val punchedIn = openSession != null

    fun say(text: String, error: Boolean = false) {
        message = text
        isError = error
    }

    suspend fun reload() {
        try {
            val payload = withContext(Dispatchers.IO) {
                val api = ApiClient(context)
                val me = api.getMe()
                val att = api.getAttendance()
                me to att
            }
            val u = payload.first.optJSONObject("user")
            if (u == null) {
                FieldLocationService.stop(context)
                SessionStore.clear(context)
                onLoggedOut()
                return
            }
            user = u
            openSession = payload.second.optJSONObject("open")
            todayDistance = payload.second.optDouble("todayDistanceMeters", 0.0)
            todayHours = payload.second.optDouble("todayHoursWorked", 0.0)
        } catch (e: Exception) {
            say(errorText(e, "Could not load dashboard"), true)
        } finally {
            loading = false
        }
    }

    /** Runs the punch call once the face module has returned a descriptor + image. */
    fun punch(punchIn: Boolean, descriptorJson: String, image: String) {
        busy = true
        say(if (punchIn) "Punching in…" else "Punching out…")
        scope.launch {
            try {
                val act = activity ?: throw IllegalStateException("App is not ready.")
                val loc: Location = awaitLocation(act)
                SecurityHelper.assertSecureForPunch(context, loc)
                val descriptor = parseFacePayload(descriptorJson).first
                val res = withContext(Dispatchers.IO) {
                    val api = ApiClient(context)
                    if (punchIn) {
                        api.punchIn(loc.latitude, loc.longitude, loc.accuracy.toDouble(), descriptor, image)
                    } else {
                        api.punchOut(loc.latitude, loc.longitude, loc.accuracy.toDouble(), descriptor, image)
                    }
                }
                if (punchIn) {
                    val punchInAt = res.optJSONObject("attendance")?.optString("punchInAt", "").orEmpty()
                    if (punchInAt.isNotBlank()) {
                        FieldLocationService.start(
                            context,
                            SessionStore.apiBase(context),
                            SessionStore.token(context),
                            punchInAt
                        )
                        LocationHelper.requestBackgroundLocation(act)
                    }
                    say("Punched in. Route tracking is on.")
                } else {
                    FieldLocationService.stop(context)
                    say("Punched out.")
                }
                reload()
            } catch (e: Exception) {
                say(errorText(e, "Punch failed"), true)
            } finally {
                busy = false
            }
        }
    }

    fun registerFace(payloadJson: String, image: String) {
        busy = true
        say("Saving face…")
        scope.launch {
            try {
                val (descriptor, samples) = parseFacePayload(payloadJson)
                withContext(Dispatchers.IO) {
                    ApiClient(context).registerFace(descriptor, samples, image, false)
                }
                say("Face registered.")
                reload()
            } catch (e: Exception) {
                say(errorText(e, "Face register failed"), true)
            } finally {
                busy = false
            }
        }
    }

    /** The Compose face screen leaves its descriptor on the bus and pops back here. */
    val faceResult = FaceResultBus.pending
    LaunchedEffect(faceResult) {
        val result = FaceResultBus.take() ?: return@LaunchedEffect
        when (result.mode) {
            DashboardActivity.MODE_REGISTER -> registerFace(result.payloadJson, result.image)
            DashboardActivity.MODE_PUNCH_IN -> punch(true, result.payloadJson, result.image)
            DashboardActivity.MODE_PUNCH_OUT -> punch(false, result.payloadJson, result.image)
        }
    }

    fun openFace(mode: String) = onOpen(Routes.face(mode))

    /** GPS fix + security scan happen before we open the face module, same as before. */
    fun startPunch(mode: String) {
        val act = activity ?: return
        busy = true
        say("Getting GPS…")
        scope.launch {
            try {
                val loc = awaitLocation(act)
                SecurityHelper.assertSecureForPunch(context, loc)
                gpsText = String.format(
                    java.util.Locale.US,
                    "GPS %.5f, %.5f  ±%.0fm",
                    loc.latitude, loc.longitude, loc.accuracy
                )
                say("")
                openFace(mode)
            } catch (e: Exception) {
                say(errorText(e, "Could not verify GPS location."), true)
            } finally {
                busy = false
            }
        }
    }

    var pendingMode by remember { mutableStateOf<String?>(null) }

    fun continueAfterLocation(mode: String?) {
        if (mode != null) startPunch(mode)
    }

    val backgroundPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        val mode = pendingMode
        pendingMode = null
        continueAfterLocation(mode)
    }

    fun promptAlwaysAllowThen(mode: String?) {
        val act = activity ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || LocationHelper.hasBackgroundLocation(act)) {
            continueAfterLocation(mode)
            return
        }
        pendingMode = mode
        say(act.getString(R.string.allow_always_hint))
        backgroundPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true
        val mode = pendingMode
        if (!granted) {
            pendingMode = null
            say("Location permission is required to punch.", true)
            return@rememberLauncherForActivityResult
        }
        promptAlwaysAllowThen(mode)
    }

    fun requestPunch(mode: String) {
        val act = activity ?: return
        if (!LocationHelper.hasFineLocation(act)) {
            pendingMode = mode
            locationPermissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
            return
        }
        promptAlwaysAllowThen(mode)
    }

    LaunchedEffect(Unit) {
        activity?.let { LocationHelper.requestNotifications(it) }
    }

    LaunchedEffect(punchedIn) {
        if (punchedIn) FieldLocationService.startExisting(context)
    }

    LaunchedEffect(reloadKey) {
        reload()
        // Admin audit: log VPN / spoof apps even outside a punch.
        withContext(Dispatchers.IO) {
            try {
                val act = activity
                if (act != null) {
                    ApiClient(context).reportLocationPermission(
                        LocationHelper.hasFineLocation(act),
                        LocationHelper.hasBackgroundLocation(act)
                    )
                }
            } catch (_: Exception) {
            }
            if (SecurityHelper.isVpnActive(context)) {
                SecurityReporter.report(context, "vpn", "detected", "VPN active on device", null, null)
            }
            SecurityHelper.findMockGpsAppPackage(context)?.let {
                SecurityReporter.report(context, "spoof_app", "detected", it, null, null)
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) reloadKey++
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp)
    ) {
        Spacer(Modifier.height(14.dp))

        ProfileHeader(
            name = user?.stringOrNull("name") ?: if (loading) stringResource(R.string.loading) else "Field member",
            meta = listOfNotNull(
                user?.stringOrNull("sectorAllotted"),
                user?.stringOrNull("assemblyName")
            ).joinToString(" · ").ifBlank { SessionStore.phone(context) },
            onRefresh = { reloadKey++ },
            onToggleLanguage = {
                val next = if (LocaleHelper.currentLang(context) == "pa") "en" else "pa"
                LocaleHelper.setLanguage(context, next)
                activity?.recreate()
            }
        )

        Spacer(Modifier.height(18.dp))

        StatusPill(punchedIn = punchedIn)

        Spacer(Modifier.height(16.dp))

        AnimatedVisibility(
            visible = true,
            enter = fadeIn(tween(400)) + slideInVertically(tween(400)) { it / 6 }
        ) {
            AapCard(Modifier.fillMaxWidth()) {
                Column {
                    Row(Modifier.fillMaxWidth()) {
                        StatBlock(stringResource(R.string.today_distance), prettyDistance(todayDistance), Modifier.weight(1f))
                        StatBlock(
                            stringResource(R.string.hours_worked),
                            String.format(java.util.Locale.US, "%.1f h", todayHours),
                            Modifier.weight(1f)
                        )
                    }
                    if (punchedIn) {
                        Spacer(Modifier.height(12.dp))
                        Text(
                            "Since ${prettyTime(openSession?.stringOrNull("punchInAt"))} · ${
                                prettyDuration(openSession?.stringOrNull("punchInAt"), null)
                            }",
                            style = MaterialTheme.typography.bodyMedium,
                            color = AapColors.TextMuted
                        )
                    }
                }
            }
        }

        Spacer(Modifier.height(18.dp))

        if (!loading && !faceRegistered) {
            RegisterFaceCard(busy = busy, onRegister = { openFace(DashboardActivity.MODE_REGISTER) })
            Spacer(Modifier.height(18.dp))
        }

        if (loading) {
            Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = AapColors.Yellow)
            }
        } else if (faceRegistered || punchedIn) {
            PunchButton(
                punchedIn = punchedIn,
                busy = busy,
                onClick = {
                    requestPunch(
                        if (punchedIn) DashboardActivity.MODE_PUNCH_OUT else DashboardActivity.MODE_PUNCH_IN
                    )
                }
            )
        }

        AnimatedVisibility(
            visible = gpsText.isNotBlank(),
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            Text(
                gpsText,
                Modifier.padding(top = 10.dp),
                style = MaterialTheme.typography.labelMedium,
                color = AapColors.TextMuted
            )
        }

        AnimatedVisibility(
            visible = message.isNotBlank(),
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically()
        ) {
            Text(
                message,
                Modifier.padding(top = 10.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = if (isError) AapColors.Danger else AapColors.Success
            )
        }

        Spacer(Modifier.height(24.dp))

        Text(
            stringResource(R.string.quick_actions),
            style = MaterialTheme.typography.labelMedium,
            color = AapColors.TextMuted,
            letterSpacing = 2.sp
        )
        Spacer(Modifier.height(12.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            ActionCard(
                title = stringResource(R.string.live_map),
                subtitle = stringResource(R.string.route_today),
                icon = { Icon(Icons.Filled.Map, null, tint = AapColors.Navy) },
                modifier = Modifier.weight(1f),
                onClick = { onOpen(Routes.MAP) }
            )
            ActionCard(
                title = stringResource(R.string.footprints),
                subtitle = stringResource(R.string.past_sessions),
                icon = { Icon(Icons.Filled.Timeline, null, tint = AapColors.Navy) },
                modifier = Modifier.weight(1f),
                onClick = { onOpen(Routes.FOOTPRINTS) }
            )
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            ActionCard(
                title = stringResource(R.string.leave_request),
                subtitle = stringResource(R.string.apply_leave),
                icon = { Icon(Icons.Filled.EventAvailable, null, tint = AapColors.Navy) },
                modifier = Modifier.weight(1f),
                onClick = { onOpen(Routes.LEAVE) }
            )
            ActionCard(
                title = stringResource(R.string.face_check),
                subtitle = stringResource(R.string.camera_self_test),
                icon = { Icon(Icons.Filled.Face, null, tint = AapColors.Navy) },
                modifier = Modifier.weight(1f),
                onClick = { onOpen(Routes.face(FACE_MODE_CHECK)) }
            )
        }

        Spacer(Modifier.height(26.dp))

        OutlinedButton(
            onClick = {
                FieldLocationService.stop(context)
                SessionStore.clear(context)
                onLoggedOut()
            },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(16.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = AapColors.TextMuted)
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, null, Modifier.size(18.dp))
            Spacer(Modifier.size(8.dp))
            Text(stringResource(R.string.logout))
        }

        Spacer(Modifier.height(18.dp))
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            AapAccentBar()
        }
        Spacer(Modifier.height(28.dp))
    }
}

/** Face payload is either `{descriptor, samples}` or a bare descriptor array. */
private fun parseFacePayload(payloadJson: String): Pair<JSONArray, JSONArray> {
    if (payloadJson.trim().startsWith("{")) {
        val payload = JSONObject(payloadJson)
        val descriptor = payload.getJSONArray("descriptor")
        val samples = payload.optJSONArray("samples") ?: JSONArray().put(descriptor)
        return descriptor to samples
    }
    val descriptor = JSONArray(payloadJson)
    return descriptor to JSONArray().put(descriptor)
}

@Composable
private fun ProfileHeader(
    name: String,
    meta: String,
    onRefresh: () -> Unit,
    onToggleLanguage: () -> Unit
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        AapBrandMark(size = 52)
        Spacer(Modifier.size(14.dp))
        Column(Modifier.weight(1f)) {
            Text(
                name,
                style = MaterialTheme.typography.headlineSmall,
                color = AapColors.TextPrimary,
                maxLines = 1
            )
            Text(
                meta,
                style = MaterialTheme.typography.bodyMedium,
                color = AapColors.TextMuted,
                maxLines = 1
            )
        }
        IconButton(onClick = onToggleLanguage) {
            Icon(Icons.Filled.Translate, "Language", tint = AapColors.TextMuted)
        }
        IconButton(onClick = onRefresh) {
            Icon(Icons.Filled.Refresh, "Refresh", tint = AapColors.TextMuted)
        }
    }
}

@Composable
private fun StatusPill(punchedIn: Boolean) {
    val pulse = rememberInfiniteTransition(label = "pulse")
    val alpha by pulse.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Reverse),
        label = "pulseAlpha"
    )
    val tint = if (punchedIn) AapColors.Success else AapColors.TextMuted
    Surface(
        shape = RoundedCornerShape(50),
        color = tint.copy(alpha = 0.14f),
        border = null
    ) {
        Row(
            Modifier.padding(horizontal = 16.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier
                    .size(9.dp)
                    .clip(RoundedCornerShape(50))
                    .background(tint.copy(alpha = if (punchedIn) alpha else 0.6f))
            )
            Spacer(Modifier.size(9.dp))
            Text(
                if (punchedIn) stringResource(R.string.punched_in) else stringResource(R.string.not_punched_in),
                style = MaterialTheme.typography.labelLarge,
                color = tint
            )
        }
    }
}

@Composable
private fun StatBlock(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = AapColors.TextMuted)
        Spacer(Modifier.size(4.dp))
        Text(value, style = MaterialTheme.typography.headlineSmall, color = AapColors.Yellow)
    }
}

@Composable
private fun PunchButton(punchedIn: Boolean, busy: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !busy,
        modifier = Modifier
            .fillMaxWidth()
            .height(96.dp),
        shape = RoundedCornerShape(28.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (punchedIn) AapColors.Blue else AapColors.Yellow,
            contentColor = if (punchedIn) Color.White else AapColors.Navy,
            disabledContainerColor = (if (punchedIn) AapColors.Blue else AapColors.Yellow).copy(alpha = 0.5f),
            disabledContentColor = (if (punchedIn) Color.White else AapColors.Navy).copy(alpha = 0.6f)
        ),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 12.dp, pressedElevation = 3.dp)
    ) {
        if (busy) {
            CircularProgressIndicator(
                Modifier.size(26.dp),
                color = if (punchedIn) Color.White else AapColors.Navy,
                strokeWidth = 3.dp
            )
        } else {
            Icon(
                if (punchedIn) Icons.AutoMirrored.Filled.Logout else Icons.AutoMirrored.Filled.Login,
                null,
                Modifier.size(32.dp)
            )
            Spacer(Modifier.size(14.dp))
            Column {
                Text(
                    if (punchedIn) stringResource(R.string.punch_out).uppercase()
                    else stringResource(R.string.punch_in).uppercase(),
                    fontWeight = FontWeight.Black,
                    fontSize = 22.sp,
                    letterSpacing = 1.sp
                )
                Text(
                    stringResource(R.string.face_verified_cta),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

@Composable
private fun RegisterFaceCard(busy: Boolean, onRegister: () -> Unit) {
    AapCard(Modifier.fillMaxWidth()) {
        Column {
            Text(
                stringResource(R.string.register_face_title),
                style = MaterialTheme.typography.titleLarge,
                color = AapColors.TextPrimary
            )
            Spacer(Modifier.size(6.dp))
            Text(
                stringResource(R.string.register_face_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = AapColors.TextMuted
            )
            Spacer(Modifier.size(14.dp))
            Button(
                onClick = onRegister,
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AapColors.Blue,
                    contentColor = Color.White
                )
            ) {
                Icon(Icons.Filled.Face, null, Modifier.size(20.dp))
                Spacer(Modifier.size(10.dp))
                Text(stringResource(R.string.register_face), fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ActionCard(
    title: String,
    subtitle: String,
    icon: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(24.dp),
        color = AapColors.NavyCard.copy(alpha = 0.85f),
        shadowElevation = 4.dp
    ) {
        Column(Modifier.padding(16.dp)) {
            Box(
                Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Brush.linearGradient(listOf(AapColors.Yellow, AapColors.YellowDim))),
                contentAlignment = Alignment.Center
            ) { icon() }
            Spacer(Modifier.size(12.dp))
            Text(title, style = MaterialTheme.typography.titleMedium, color = AapColors.TextPrimary)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = AapColors.TextMuted)
        }
    }
}
