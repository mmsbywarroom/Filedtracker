package `in`.videh.filedtracker.nativeapp.compose

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
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
)

private val OUTCOMES = listOf(
    "" to "Result",
    "connected" to "Connected",
    "no_answer" to "No answer",
    "busy" to "Busy",
    "call_later" to "Call later",
    "wrong_number" to "Wrong number",
)

@Composable
fun CallListScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var rows by remember { mutableStateOf<List<CallRow>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var openMenu by remember { mutableStateOf<String?>(null) }

    fun load() {
        scope.launch {
            loading = true
            error = ""
            try {
                val json = withContext(Dispatchers.IO) { ApiClient(context).getCalls() }
                val arr = json.optJSONArray("contacts")
                val next = mutableListOf<CallRow>()
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        val o = arr.optJSONObject(i) ?: continue
                        next.add(o.toCallRow())
                    }
                }
                rows = next
            } catch (e: Exception) {
                error = e.message ?: "Could not load call list."
            } finally {
                loading = false
            }
        }
    }

    LaunchedEffect(Unit) { load() }

    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(onClick = onBack) { Text("Back") }
            Spacer(Modifier.weight(1f))
            Text("Do the call", style = MaterialTheme.typography.titleLarge, color = AapColors.TextPrimary)
        }
        Text(
            "Numbers assigned to you. Call opens the phone dialer.",
            style = MaterialTheme.typography.bodySmall,
            color = AapColors.TextMuted,
            modifier = Modifier.padding(top = 8.dp, bottom = 12.dp)
        )
        if (loading) {
            CircularProgressIndicator(color = AapColors.Yellow)
        } else if (error.isNotEmpty()) {
            Text(error, color = AapColors.TextPrimary)
        } else if (rows.isEmpty()) {
            Text("No numbers assigned yet.", color = AapColors.TextMuted)
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(rows, key = { it.id }) { row ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = AapColors.Navy.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text("${row.serial}. ${row.name}", style = MaterialTheme.typography.titleMedium, color = AapColors.TextPrimary)
                            Text(row.phone, color = AapColors.TextMuted)
                            if (row.vehicleNumber.isNotBlank()) {
                                Text("Vehicle ${row.vehicleNumber}", style = MaterialTheme.typography.bodySmall, color = AapColors.TextMuted)
                            }
                            Spacer(Modifier.height(10.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Button(
                                    onClick = {
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:+91${row.phone}"))
                                        context.startActivity(intent)
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = AapColors.Yellow, contentColor = AapColors.Navy)
                                ) { Text("Call") }
                                BoxMenu(
                                    label = OUTCOMES.firstOrNull { it.first == row.outcome }?.second ?: "Result",
                                    expanded = openMenu == row.id,
                                    onOpen = { openMenu = row.id },
                                    onDismiss = { openMenu = null },
                                    options = OUTCOMES.filter { it.first.isNotEmpty() },
                                    onPick = { value ->
                                        openMenu = null
                                        rows = rows.map { if (it.id == row.id) it.copy(outcome = value) else it }
                                        scope.launch {
                                            try {
                                                withContext(Dispatchers.IO) {
                                                    ApiClient(context).saveCallOutcome(row.id, value)
                                                }
                                            } catch (e: Exception) {
                                                error = e.message ?: "Could not save result."
                                            }
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BoxMenu(
    label: String,
    expanded: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    options: List<Pair<String, String>>,
    onPick: (String) -> Unit,
) {
    Column {
        OutlinedButton(onClick = onOpen) { Text(label) }
        DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
            options.forEach { (value, text) ->
                DropdownMenuItem(text = { Text(text) }, onClick = { onPick(value) })
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
)
