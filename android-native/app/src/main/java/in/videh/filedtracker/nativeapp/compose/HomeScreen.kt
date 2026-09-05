package `in`.videh.filedtracker.nativeapp.compose

import android.Manifest
import android.content.Intent
import android.net.Uri
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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
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

    var user by remember { mutableStateOf(HomeDashboardCache.user) }
    var openSession by remember { mutableStateOf(HomeDashboardCache.openSession) }
    var todayDistance by remember { mutableStateOf(HomeDashboardCache.todayDistance) }
    var todayHours by remember { mutableStateOf(HomeDashboardCache.todayHours) }
    // Only full-screen load on true cold start — never after camera return.
    var loading by remember { mutableStateOf(!HomeDashboardCache.bootstrapped) }
    var refreshing by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }
    var gpsText by remember { mutableStateOf("") }
    var updateRequired by remember { mutableStateOf(false) }
    var updateApkUrl by remember { mutableStateOf(SessionStore.apiBase(context).trimEnd('/') + "/aap-attendance-native.apk") }
    var updateVersionName by remember { mutableStateOf("") }

    val bootstrapped = user != null || HomeDashboardCache.bootstrapped
    val faceRegistered = user.hasFaceRegistered()
    val punchedIn = openSession != null

    fun say(text: String, error: Boolean = false) {
        message = text
        isError = error
    }

    fun localVersionCode(): Int {
        return try {
            val p = context.packageManager.getPackageInfo(context.packageName, 0)
            if (android.os.Build.VERSION.SDK_INT >= 28) p.longVersionCode.toInt() else @Suppress("DEPRECATION") p.versionCode
        } catch (_: Exception) {
            0
        }
    }

    suspend fun checkForceUpdate() {
        try {
            val ver = withContext(Dispatchers.IO) { ApiClient.getAppVersion() }
            val minCode = ver.optInt("androidVersionCode", 0)
            val apk = ver.optString("apkUrl", "").orEmpty()
            val name = ver.optString("androidVersionName", "").orEmpty()
            if (apk.startsWith("http")) {
                updateApkUrl = apk
            } else if (apk.isNotBlank()) {
                updateApkUrl = SessionStore.apiBase(context).trimEnd('/') + apk
            }
            updateVersionName = name
            updateRequired = minCode > 0 && localVersionCode() < minCode
        } catch (_: Exception) {
            // If version check fails, do not brick punch — network may be flaky.
        }
    }

    suspend fun reload(silent: Boolean) {
        if (!silent && !bootstrapped) loading = true
        if (silent) refreshing = true
        try {
            // Never leave the home screen stuck on "Loading…" / missing punch button.
            val payload = withContext(Dispatchers.IO) {
                withTimeout(18_000) {
                    coroutineScope {
                        val api = ApiClient(context)
                        val meDeferred = async { api.getMe() }
                        val attDeferred = async { api.getAttendance() }
                        meDeferred.await() to attDeferred.await()
                    }
                }
            }
            val u = payload.first.optJSONObject("user")
            if (u == null) {
                FieldLocationService.stop(context)
                HomeDashboardCache.clear()
                SessionStore.clear(context)
                onLoggedOut()
                return
            }
            HomeDashboardCache.applyMeAndAttendance(payload.first, payload.second)
            user = HomeDashboardCache.user
            openSession = HomeDashboardCache.openSession
            todayDistance = HomeDashboardCache.todayDistance
            todayHours = HomeDashboardCache.todayHours
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Keep cached UI; only surface errors when we have nothing to show.
            if (!bootstrapped) {
                val text = when {
                    e is kotlinx.coroutines.TimeoutCancellationException ||
                        (e.message?.contains("timed out", ignoreCase = true) == true) ->
                        "Server is slow or busy. Tap refresh and try again."
                    else -> errorText(e, "Could not load dashboard")
                }
                if (text.isNotBlank()) say(text, true)
            }
        } finally {
            loading = false
            refreshing = false
        }
    }

    fun openFace(mode: String) = onOpen(Routes.face(mode))

    /** Open camera immediately — GPS + punch/register run on the face screen (errors stay there). */
    fun startPunch(mode: String) {
        say("")
        openFace(mode)
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
        if (updateRequired) {
            say("Please update the app first, then punch.", true)
            return
        }
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

    // First paint: hydrate from cache, load dashboard. Version + security never block UI.
    LaunchedEffect(Unit) {
        val cold = !HomeDashboardCache.bootstrapped
        user = HomeDashboardCache.user
        openSession = HomeDashboardCache.openSession
        todayDistance = HomeDashboardCache.todayDistance
        todayHours = HomeDashboardCache.todayHours
        if (!cold) loading = false

        reload(silent = !cold)

        // Background only — do not delay punch button.
        launch {
            try {
                checkForceUpdate()
            } catch (_: Exception) {
            }
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
                try {
                    if (SecurityHelper.isVpnActive(context)) {
                        SecurityReporter.report(context, "vpn", "detected", "VPN active on device", null, null)
                    }
                    SecurityHelper.findMockGpsAppPackage(context)?.let {
                        SecurityReporter.report(context, "spoof_app", "detected", it, null, null)
                    }
                } catch (_: Exception) {
                }
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        var firstResume = true
        var lastResumeAt = 0L
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                // Skip first resume — LaunchedEffect(Unit) already loads.
                if (firstResume) {
                    firstResume = false
                    return@LifecycleEventObserver
                }
                val now = System.currentTimeMillis()
                if (now - lastResumeAt < 2_000L) return@LifecycleEventObserver
                lastResumeAt = now
                // Instant UI from cache (FaceScreen writes here before pop).
                user = HomeDashboardCache.user
                openSession = HomeDashboardCache.openSession
                todayDistance = HomeDashboardCache.todayDistance
                todayHours = HomeDashboardCache.todayHours
                loading = false
                scope.launch {
                    try {
                        reload(silent = true)
                    } catch (_: CancellationException) {
                    } catch (_: Exception) {
                    }
                }
            }
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
            name = user?.stringOrNull("name")
                ?: if (loading && !bootstrapped) stringResource(R.string.loading) else "Field member",
            meta = listOfNotNull(
                user?.stringOrNull("sectorAllotted"),
                user?.stringOrNull("assemblyName")
            ).joinToString(" · ").ifBlank { SessionStore.phone(context) },
            onRefresh = {
                scope.launch {
                    try {
                        reload(silent = bootstrapped)
                    } catch (_: CancellationException) {
                    } catch (_: Exception) {
                    }
                }
            },
            onToggleLanguage = {
                val next = if (LocaleHelper.currentLang(context) == "pa") "en" else "pa"
                LocaleHelper.setLanguage(context, next)
                activity?.recreate()
            }
        )

        Spacer(Modifier.height(18.dp))

        StatusPill(punchedIn = punchedIn)

        if (updateRequired) {
            Spacer(Modifier.height(16.dp))
            ForceUpdateCard(
                versionName = updateVersionName,
                onUpdate = {
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(updateApkUrl))
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        say(errorText(e, "Could not open download link"), true)
                    }
                }
            )
        }

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

        // Punch / register always stay visible after first successful load — never hide during refresh.
        if (!updateRequired) {
            if (bootstrapped && !faceRegistered && !punchedIn) {
                RegisterFaceCard(busy = busy, onRegister = { openFace(DashboardActivity.MODE_REGISTER) })
                Spacer(Modifier.height(18.dp))
            }

            if (loading && !bootstrapped) {
                Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AapColors.Yellow)
                }
            } else if (bootstrapped && (faceRegistered || punchedIn)) {
                PunchButton(
                    punchedIn = punchedIn,
                    busy = busy,
                    onClick = {
                        requestPunch(
                            if (punchedIn) DashboardActivity.MODE_PUNCH_OUT else DashboardActivity.MODE_PUNCH_IN
                        )
                    }
                )
            } else if (!loading && !bootstrapped) {
                // Network failed cold start — still offer punch path using register or retry.
                PunchButton(
                    punchedIn = false,
                    busy = busy,
                    onClick = {
                        say("Loading profile… tap refresh if this fails.", true)
                        scope.launch {
                            try {
                                reload(silent = false)
                            } catch (_: CancellationException) {
                            } catch (_: Exception) {
                            }
                        }
                    }
                )
            }
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
                HomeDashboardCache.clear()
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
private fun ForceUpdateCard(versionName: String, onUpdate: () -> Unit) {
    AapCard(Modifier.fillMaxWidth()) {
        Column {
            Text(
                "Update required",
                style = MaterialTheme.typography.titleLarge,
                color = AapColors.Yellow
            )
            Spacer(Modifier.size(6.dp))
            Text(
                if (versionName.isNotBlank()) {
                    "A new app version (v$versionName) is available. Update now to punch in or punch out."
                } else {
                    "A new app version is available. Update now to punch in or punch out."
                },
                style = MaterialTheme.typography.bodyMedium,
                color = AapColors.TextMuted
            )
            Spacer(Modifier.size(14.dp))
            Button(
                onClick = onUpdate,
                modifier = Modifier.fillMaxWidth().height(54.dp),
                shape = RoundedCornerShape(16.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AapColors.Yellow,
                    contentColor = AapColors.Navy
                )
            ) {
                Text("Update app", fontWeight = FontWeight.Bold)
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
