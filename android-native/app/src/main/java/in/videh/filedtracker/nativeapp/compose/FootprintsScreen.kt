package `in`.videh.filedtracker.nativeapp.compose

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Timeline
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
import androidx.compose.ui.unit.dp
import `in`.videh.filedtracker.nativeapp.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

@Composable
fun FootprintsScreen(onBack: () -> Unit) {
    val context = LocalContext.current

    var records by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        try {
            val res = withContext(Dispatchers.IO) { ApiClient(context).getHistory() }
            records = res.optJSONArray("records")?.objects().orEmpty()
        } catch (e: Exception) {
            error = errorText(e, "Could not load your footprints")
        } finally {
            loading = false
        }
    }

    AapScreenScaffold(
        title = "Footprints",
        subtitle = if (records.isEmpty()) "Your attendance sessions" else "${records.size} recent sessions",
        onBack = onBack
    ) {
        Box(
            Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
        ) {
            when {
                loading -> CenterBox { CircularProgressIndicator(color = AapColors.Yellow) }
                error.isNotBlank() -> InfoCard(title = "Something went wrong", body = error)
                records.isEmpty() -> InfoCard(
                    title = "No sessions yet",
                    body = "Once you punch in, every session shows up here with distance travelled and timings."
                )
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(records) { record -> SessionCard(record) }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun SessionCard(record: JSONObject) {
    val live = record.stringOrNull("status") == "live"
    val tint = if (live) AapColors.Success else AapColors.Blue

    AapCard(Modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(13.dp))
                        .background(tint.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.Timeline, null, Modifier.size(20.dp), tint = tint)
                }
                Spacer(Modifier.size(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        prettyDate(record.stringOrNull("punchInAt")),
                        style = MaterialTheme.typography.titleMedium,
                        color = AapColors.TextPrimary
                    )
                    Text(
                        "${prettyTime(record.stringOrNull("punchInAt"))} — " +
                            (record.stringOrNull("punchOutAt")?.let { prettyTime(it) } ?: "still open"),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AapColors.TextMuted
                    )
                }
                Surface(shape = RoundedCornerShape(50), color = tint.copy(alpha = 0.16f)) {
                    Text(
                        if (live) "LIVE" else "DONE",
                        Modifier.padding(horizontal = 11.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = tint
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth()) {
                Metric("Duration", prettyDuration(record.stringOrNull("punchInAt"), record.stringOrNull("punchOutAt")), Modifier.weight(1f))
                Metric("Distance", prettyDistance(record.optDouble("distanceMeters", 0.0)), Modifier.weight(1f))
                Metric("Marks", record.optInt("marks", 0).toString(), Modifier.weight(1f))
            }

            record.stringOrNull("punchInAddress")?.let { address ->
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.Top) {
                    Icon(Icons.Filled.Place, null, Modifier.size(16.dp), tint = AapColors.Yellow)
                    Spacer(Modifier.size(8.dp))
                    Text(address, style = MaterialTheme.typography.bodyMedium, color = AapColors.TextMuted)
                }
            }
        }
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = AapColors.TextMuted)
        Spacer(Modifier.size(2.dp))
        Text(value, style = MaterialTheme.typography.titleMedium, color = AapColors.TextPrimary)
    }
}
