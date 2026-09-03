package `in`.videh.filedtracker.nativeapp.compose

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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapType
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import `in`.videh.filedtracker.nativeapp.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private data class RouteData(
    val points: List<LatLng>,
    val start: LatLng?,
    val end: LatLng?,
    val live: Boolean,
    val distanceMeters: Double,
    val punchInAt: String?
)

@Composable
fun MapScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val apiKey = remember { mapsApiKey(context) }

    var route by remember { mutableStateOf<RouteData?>(null) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            val att = withContext(Dispatchers.IO) { ApiClient(context).getAttendance() }
            val open = att.optJSONObject("open")
            val session = open ?: att.optJSONArray("history")?.objects()?.firstOrNull()
            if (session == null) {
                route = null
            } else {
                val pts = session.optJSONArray("points")?.objects().orEmpty().mapNotNull { p ->
                    val lat = p.doubleOrNull("lat")
                    val lng = p.doubleOrNull("lng")
                    if (lat != null && lng != null) LatLng(lat, lng) else null
                }
                val startLat = session.doubleOrNull("punchInLat")
                val startLng = session.doubleOrNull("punchInLng")
                val endLat = session.doubleOrNull("punchOutLat")
                val endLng = session.doubleOrNull("punchOutLng")
                route = RouteData(
                    points = pts,
                    start = if (startLat != null && startLng != null) LatLng(startLat, startLng) else pts.firstOrNull(),
                    end = if (endLat != null && endLng != null) LatLng(endLat, endLng)
                    else if (open != null) pts.lastOrNull() else null,
                    live = open != null,
                    distanceMeters = session.optDouble("distanceMeters", 0.0),
                    punchInAt = session.stringOrNull("punchInAt")
                )
            }
        } catch (e: Exception) {
            error = errorText(e, "Could not load your route")
        } finally {
            loading = false
        }
    }

    AapScreenScaffold(
        title = "Live map",
        subtitle = route?.let {
            if (it.live) "Current session · ${prettyDistance(it.distanceMeters)}"
            else "Last session · ${prettyDate(it.punchInAt)}"
        } ?: "Your field route",
        onBack = onBack
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 4.dp)
        ) {
            when {
                loading -> CenterBox { CircularProgressIndicator(color = AapColors.Yellow) }

                apiKey.isBlank() -> InfoCard(
                    title = "Map key not configured",
                    body = "This build has no Google Maps key. Add MAPS_API_KEY=<your key> to " +
                        "android-native/local.properties and rebuild to see your route on the map. " +
                        "Punch in / out and tracking keep working without it."
                )

                error.isNotBlank() -> InfoCard(title = "Could not load map", body = error)

                route == null || (route!!.points.isEmpty() && route!!.start == null) -> InfoCard(
                    title = "No route yet",
                    body = "Punch in and your movement for the day will be drawn here automatically."
                )

                else -> {
                    val data = route!!
                    val anchor = data.start ?: data.points.first()
                    val cameraPositionState = rememberCameraPositionState {
                        position = CameraPosition.fromLatLngZoom(anchor, 15f)
                    }

                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .weight(1f)
                            .clip(RoundedCornerShape(24.dp)),
                        color = AapColors.NavyCard
                    ) {
                        GoogleMap(
                            modifier = Modifier.fillMaxSize(),
                            cameraPositionState = cameraPositionState,
                            properties = MapProperties(mapType = MapType.NORMAL),
                            uiSettings = MapUiSettings(zoomControlsEnabled = false, mapToolbarEnabled = false),
                            onMapLoaded = {
                                val all = buildList {
                                    addAll(data.points)
                                    data.start?.let { add(it) }
                                    data.end?.let { add(it) }
                                }
                                if (all.size > 1) {
                                    try {
                                        val b = LatLngBounds.builder()
                                        all.forEach { b.include(it) }
                                        cameraPositionState.move(
                                            CameraUpdateFactory.newLatLngBounds(b.build(), 90)
                                        )
                                    } catch (ignored: Exception) {
                                    }
                                }
                            }
                        ) {
                            if (data.points.size > 1) {
                                Polyline(
                                    points = data.points,
                                    color = AapColors.Blue,
                                    width = 12f
                                )
                            }
                            data.start?.let {
                                Marker(state = MarkerState(position = it), title = "Punch in")
                            }
                            data.end?.let {
                                Marker(
                                    state = MarkerState(position = it),
                                    title = if (data.live) "Latest position" else "Punch out"
                                )
                            }
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        MapStat("Distance", prettyDistance(data.distanceMeters), Modifier.weight(1f))
                        MapStat("Track points", data.points.size.toString(), Modifier.weight(1f))
                        MapStat("Status", if (data.live) "Live" else "Closed", Modifier.weight(1f))
                    }
                    Spacer(Modifier.height(18.dp))
                }
            }
        }
    }
}

@Composable
private fun MapStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        color = AapColors.NavyCard.copy(alpha = 0.85f)
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = AapColors.TextMuted)
            Spacer(Modifier.size(3.dp))
            Text(value, style = MaterialTheme.typography.titleMedium, color = AapColors.Yellow)
        }
    }
}

@Composable
fun CenterBox(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }
}

/** Friendly empty / error state so screens never look broken. */
@Composable
fun InfoCard(title: String, body: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        AapCard(Modifier.fillMaxWidth()) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Map, null, Modifier.size(40.dp), tint = AapColors.Yellow)
                Spacer(Modifier.height(12.dp))
                Text(title, style = MaterialTheme.typography.titleLarge, color = AapColors.TextPrimary)
                Spacer(Modifier.height(8.dp))
                Text(
                    body,
                    style = MaterialTheme.typography.bodyMedium,
                    color = AapColors.TextMuted,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}
