package `in`.videh.filedtracker.nativeapp.compose

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import `in`.videh.filedtracker.nativeapp.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

private data class CallRow(
    val id: String,
    val serial: Int,
    val name: String,
    val phone: String,
    val vehicleNumber: String,
    val outcome: String,
    val attending: String,
    val companions: String,
)

private data class OutcomeOpt(val value: String, val label: String, val color: Color)

private val OUTCOMES = listOf(
    OutcomeOpt("call_complete", "Call Complete", Color(0xFF15803D)),
    OutcomeOpt("call_disconnected", "Call Disconnected", Color(0xFFEA580C)),
    OutcomeOpt("call_back_later", "Call Back Later", Color(0xFFD97706)),
    OutcomeOpt("not_interested", "Not Interested in Giving Feedback", Color(0xFF7C3AED)),
    OutcomeOpt("party_left", "Party Left", Color(0xFFBE123C)),
    OutcomeOpt("wrong_number", "Wrong Number", Color(0xFFB91C1C)),
    OutcomeOpt("call_not_received", "Call Not Received", Color(0xFF1D4ED8)),
    OutcomeOpt("out_of_service", "Out of Service", Color(0xFF475569)),
    OutcomeOpt("invalid_number", "Invalid Number", Color(0xFF9F1239)),
    OutcomeOpt("switched_off", "Switched Off", Color(0xFF0F172A)),
)

@Composable
fun CallListScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var rows by remember { mutableStateOf<List<CallRow>>(emptyList()) }
    var callerName by remember { mutableStateOf("") }
    var assigned by remember { mutableStateOf(0) }
    var called by remember { mutableStateOf(0) }
    var statusCounts by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var openMenu by remember { mutableStateOf<String?>(null) }

    fun save(row: CallRow) {
        if (row.outcome.isBlank()) return
        scope.launch {
            try {
                withContext(Dispatchers.IO) {
                    ApiClient(context).saveCallOutcome(row.id, row.outcome, row.attending, row.companions)
                }
            } catch (e: Exception) {
                error = e.message ?: "Could not save result."
            }
        }
    }

    fun load() {
        scope.launch {
            loading = true
            error = ""
            try {
                val json = withContext(Dispatchers.IO) { ApiClient(context).getCalls() }
                callerName = json.optString("callerName")
                val summary = json.optJSONObject("summary")
                val arr = json.optJSONArray("contacts")
                val next = mutableListOf<CallRow>()
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        val o = arr.optJSONObject(i) ?: continue
                        next.add(o.toCallRow())
                    }
                }
                rows = next
                assigned = summary?.optInt("assigned") ?: next.size
                called = summary?.optInt("called") ?: next.count { it.outcome.isNotBlank() }
                val byStatus = summary?.optJSONObject("byStatus")
                statusCounts = OUTCOMES.associate { opt ->
                    opt.value to (byStatus?.optInt(opt.value) ?: next.count { it.outcome == opt.value })
                }
            } catch (e: Exception) {
                error = e.message ?: "Could not load call list."
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(
        Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(top = 22.dp)
            .padding(horizontal = 12.dp, vertical = 8.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("Back") }
            Spacer(Modifier.weight(1f))
            Text("Do the call", style = MaterialTheme.typography.titleLarge, color = AapColors.TextPrimary)
        }
        if (loading) {
            CircularProgressIndicator(color = AapColors.Yellow, modifier = Modifier.padding(top = 24.dp))
        } else if (error.isNotEmpty() && rows.isEmpty()) {
            Text(error, color = AapColors.TextPrimary, modifier = Modifier.padding(top = 16.dp))
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 12.dp)) {
                item {
                    Surface(shape = RoundedCornerShape(16.dp), color = AapColors.Navy.copy(alpha = 0.12f), modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "Hello, I am ${callerName.ifBlank { "____" }} calling on behalf of the Aam Aadmi Party. I am calling you regarding the Jashan-e-Inquilab event.",
                            color = AapColors.TextPrimary,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
                item {
                    Column {
                    Text(
                        "Assigned $assigned · Called $called · Not called yet ${assigned - called}",
                        color = AapColors.TextMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        OUTCOMES.forEach { opt ->
                            Surface(shape = RoundedCornerShape(20.dp), color = opt.color) {
                                Text(
                                    "${opt.label}: ${statusCounts[opt.value] ?: 0}",
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }
                    if (error.isNotEmpty()) {
                        Text(error, color = Color(0xFFB91C1C), fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                    }
                    }
                }
                if (rows.isEmpty()) {
                    item { Text("No numbers assigned yet.", color = AapColors.TextMuted) }
                }
                items(rows, key = { it.id }) { row ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = AapColors.Navy.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(10.dp)) {
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Text(
                                    row.name,
                                    color = AapColors.TextPrimary,
                                    fontSize = 14.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.width(120.dp)
                                )
                                Text(row.phone, color = AapColors.TextMuted, fontSize = 13.sp, modifier = Modifier.width(96.dp))
                                Text(
                                    row.vehicleNumber.ifBlank { "—" },
                                    color = AapColors.TextMuted,
                                    fontSize = 13.sp,
                                    modifier = Modifier.width(110.dp)
                                )
                                Button(
                                    onClick = {
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:+91${row.phone}"))
                                        context.startActivity(intent)
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = AapColors.Yellow, contentColor = AapColors.Navy)
                                ) { Text("Call") }
                            }
                            Spacer(Modifier.height(8.dp))
                            val picked = OUTCOMES.firstOrNull { it.value == row.outcome }
                            ColorMenu(
                                label = picked?.label ?: "Call status",
                                color = picked?.color,
                                expanded = openMenu == "${row.id}-status",
                                onOpen = { openMenu = "${row.id}-status" },
                                onDismiss = { openMenu = null },
                                options = OUTCOMES.map { Triple(it.value, it.label, it.color) },
                                onPick = { value ->
                                    openMenu = null
                                    val next = row.copy(outcome = value)
                                    rows = rows.map { if (it.id == row.id) next else it }
                                    save(next)
                                }
                            )
                            if (row.outcome.isNotBlank()) {
                                Text(
                                    "Are you coming to attend the event?",
                                    color = AapColors.TextPrimary,
                                    fontSize = 13.sp,
                                    modifier = Modifier.padding(top = 8.dp)
                                )
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                                    ChoiceButton("Coming", row.attending == "coming", Color(0xFF15803D)) {
                                        val next = row.copy(attending = "coming")
                                        rows = rows.map { if (it.id == row.id) next else it }
                                        save(next)
                                    }
                                    ChoiceButton("Not Coming", row.attending == "not_coming", Color(0xFFB91C1C)) {
                                        val next = row.copy(attending = "not_coming", companions = "")
                                        rows = rows.map { if (it.id == row.id) next else it }
                                        save(next)
                                    }
                                }
                                if (row.attending == "coming") {
                                    Text(
                                        "Very good! How many other people will be coming with you in your car?",
                                        color = AapColors.TextPrimary,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(top = 8.dp)
                                    )
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
                                        ChoiceButton("Yes", row.companions == "yes", Color(0xFF0F766E)) {
                                            val next = row.copy(companions = "yes")
                                            rows = rows.map { if (it.id == row.id) next else it }
                                            save(next)
                                        }
                                        ChoiceButton("No", row.companions == "no", Color(0xFF475569)) {
                                            val next = row.copy(companions = "no")
                                            rows = rows.map { if (it.id == row.id) next else it }
                                            save(next)
                                        }
                                    }
                                }
                                if (row.attending == "not_coming") {
                                    Text(
                                        "Alright, noted. Thank you very much!",
                                        color = AapColors.TextMuted,
                                        fontSize = 13.sp,
                                        modifier = Modifier.padding(top = 8.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChoiceButton(label: String, selected: Boolean, color: Color, onClick: () -> Unit) {
    if (selected) {
        Button(onClick = onClick, colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White)) {
            Text(label, fontSize = 12.sp)
        }
    } else {
        OutlinedButton(onClick = onClick) { Text(label, fontSize = 12.sp, color = color) }
    }
}

@Composable
private fun ColorMenu(
    label: String,
    color: Color?,
    expanded: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    options: List<Triple<String, String, Color>>,
    onPick: (String) -> Unit,
) {
    Column {
        if (color == null) {
            OutlinedButton(onClick = onOpen) { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        } else {
            Button(onClick = onOpen, colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White)) {
                Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 12.sp)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
            options.forEach { (value, text, itemColor) ->
                DropdownMenuItem(
                    text = { Text(text, color = itemColor) },
                    onClick = { onPick(value) }
                )
            }
        }
    }
}

private fun JSONObject.toCallRow() = CallRow(
    id = optString("id"),
    serial = optInt("serial"),
    name = optString("name"),
    phone = optString("phone"),
    vehicleNumber = optString("vehicleNumber"),
    outcome = optString("outcome"),
    attending = optString("attending"),
    companions = optString("companions"),
)
