package `in`.videh.filedtracker.nativeapp.compose

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.ui.text.input.KeyboardType
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
import androidx.compose.ui.text.font.FontWeight
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
    val villageWard: String,
    val outcome: String,
    val attending: String,
    val companions: String,
)

private data class OutcomeOpt(val value: String, val label: String, val short: String, val color: Color)

private val OUTCOMES = listOf(
    OutcomeOpt("call_complete", "Call Complete", "Complete", Color(0xFF15803D)),
    OutcomeOpt("call_disconnected", "Call Disconnected", "Disconnected", Color(0xFFEA580C)),
    OutcomeOpt("call_back_later", "Call Back Later", "Call later", Color(0xFFD97706)),
    OutcomeOpt("not_interested", "Not Interested in Giving Feedback", "Not interested", Color(0xFF7C3AED)),
    OutcomeOpt("party_left", "Party Left", "Party left", Color(0xFFBE123C)),
    OutcomeOpt("wrong_number", "Wrong Number", "Wrong no.", Color(0xFFB91C1C)),
    OutcomeOpt("call_not_received", "Call Not Received", "No answer", Color(0xFF1D4ED8)),
    OutcomeOpt("out_of_service", "Out of Service", "No service", Color(0xFF0369A1)),
    OutcomeOpt("invalid_number", "Invalid Number", "Invalid", Color(0xFFBE123C)),
    OutcomeOpt("switched_off", "Switched Off", "Switched off", Color(0xFF334155)),
)

private val TinyButton = PaddingValues(horizontal = 8.dp, vertical = 0.dp)

@OptIn(ExperimentalLayoutApi::class)
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
    var punjabi by remember { mutableStateOf(true) }

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
            OutlinedButton(
                onClick = onBack,
                contentPadding = TinyButton,
                modifier = Modifier.height(32.dp)
            ) { Text(if (punjabi) "ਪਿੱਛੇ" else "Back", fontSize = 12.sp) }
            Spacer(Modifier.weight(1f))
            Text(if (punjabi) "ਕਾਲ ਕਰੋ" else "Do the call", style = MaterialTheme.typography.titleMedium, color = AapColors.TextPrimary)
            Spacer(Modifier.width(8.dp))
            OutlinedButton(
                onClick = { punjabi = !punjabi },
                contentPadding = TinyButton,
                modifier = Modifier.height(32.dp)
            ) { Text(if (punjabi) "English" else "ਪੰਜਾਬੀ", fontSize = 12.sp) }
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
                            callScript(punjabi, callerName),
                            color = AapColors.TextPrimary,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
                item {
                    Column {
                    Text(
                        if (punjabi) "ਸੌਂਪੇ $assigned · ਕਾਲ ਹੋਈ $called · ਬਾਕੀ ${assigned - called}"
                        else "Assigned $assigned · Called $called · Not called yet ${assigned - called}",
                        color = AapColors.TextMuted,
                        style = MaterialTheme.typography.bodySmall
                    )
                    FlowRow(
                        Modifier.fillMaxWidth().padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        OUTCOMES.forEach { opt ->
                            Surface(shape = RoundedCornerShape(20.dp), color = opt.color) {
                                Text(
                                    "${opt.short} ${statusCounts[opt.value] ?: 0}",
                                    color = Color.White,
                                    fontSize = 10.sp,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
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
                    item { Text(if (punjabi) "ਅਜੇ ਕੋਈ ਨੰਬਰ ਨਹੀਂ।" else "No numbers assigned yet.", color = AapColors.TextMuted) }
                }
                items(rows, key = { it.id }) { row ->
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = AapColors.Navy.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Column(Modifier.weight(1.15f)) {
                                    Text(
                                        row.name,
                                        color = AapColors.TextPrimary,
                                        fontSize = 13.sp,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    if (row.villageWard.isNotBlank()) {
                                        Text(
                                            row.villageWard,
                                            color = AapColors.TextMuted,
                                            fontSize = 10.sp,
                                            maxLines = 1,
                                            overflow = TextOverflow.Ellipsis
                                        )
                                    }
                                }
                                Text(
                                    row.phone,
                                    color = AapColors.TextMuted,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    modifier = Modifier.width(78.dp)
                                )
                                Text(
                                    row.vehicleNumber.ifBlank { "—" },
                                    color = AapColors.TextMuted,
                                    fontSize = 11.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(0.7f)
                                )
                                Button(
                                    onClick = {
                                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:+91${row.phone}"))
                                        context.startActivity(intent)
                                    },
                                    contentPadding = TinyButton,
                                    modifier = Modifier.height(30.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = AapColors.Yellow, contentColor = AapColors.Navy)
                                ) { Text(if (punjabi) "ਕਾਲ" else "Call", fontSize = 11.sp) }
                            }
                            val picked = OUTCOMES.firstOrNull { it.value == row.outcome }
                            Row(
                                Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                ColorMenu(
                                    label = picked?.short ?: "Status",
                                    color = picked?.color,
                                    expanded = openMenu == row.id,
                                    onOpen = { openMenu = row.id },
                                    onDismiss = { openMenu = null },
                                    modifier = Modifier.weight(1f),
                                    options = OUTCOMES.map { Triple(it.value, it.label, it.color) },
                                    onPick = { value ->
                                        openMenu = null
                                        val next = row.copy(outcome = value)
                                        rows = rows.map { if (it.id == row.id) next else it }
                                        save(next)
                                    }
                                )
                                ChoiceButton("Coming", row.attending == "coming", Color(0xFF15803D)) {
                                    val next = row.copy(attending = "coming")
                                    rows = rows.map { if (it.id == row.id) next else it }
                                    save(next)
                                }
                                ChoiceButton("No", row.attending == "not_coming", Color(0xFFB91C1C)) {
                                    val next = row.copy(attending = "not_coming")
                                    rows = rows.map { if (it.id == row.id) next else it }
                                    save(next)
                                }
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(if (punjabi) "ਨਾਲ" else "With you", color = AapColors.TextMuted, fontSize = 9.sp, maxLines = 1)
                                    BasicTextField(
                                        value = row.companions.filter { it.isDigit() },
                                        onValueChange = { raw ->
                                            val digits = raw.filter { it.isDigit() }.take(2)
                                            val next = row.copy(companions = digits)
                                            rows = rows.map { if (it.id == row.id) next else it }
                                            if (next.outcome.isNotBlank()) save(next)
                                        },
                                        singleLine = true,
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                        textStyle = MaterialTheme.typography.bodySmall.copy(color = AapColors.TextPrimary, fontSize = 12.sp),
                                        modifier = Modifier
                                            .width(42.dp)
                                            .height(28.dp)
                                            .border(1.dp, AapColors.TextMuted.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                                            .padding(horizontal = 6.dp, vertical = 4.dp),
                                        decorationBox = { inner ->
                                            if (row.companions.isBlank()) {
                                                Text("0", color = AapColors.TextMuted, fontSize = 12.sp)
                                            }
                                            inner()
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
}

@Composable
private fun ChoiceButton(label: String, selected: Boolean, color: Color, onClick: () -> Unit) {
    if (selected) {
        Button(
            onClick = onClick,
            contentPadding = TinyButton,
            modifier = Modifier.height(30.dp),
            colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White)
        ) { Text(label, fontSize = 11.sp, maxLines = 1) }
    } else {
        OutlinedButton(onClick = onClick, contentPadding = TinyButton, modifier = Modifier.height(30.dp)) {
            Text(label, fontSize = 11.sp, color = color, maxLines = 1)
        }
    }
}

@Composable
private fun ColorMenu(
    label: String,
    color: Color?,
    expanded: Boolean,
    onOpen: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    options: List<Triple<String, String, Color>>,
    onPick: (String) -> Unit,
) {
    Column(modifier) {
        if (color == null) {
            OutlinedButton(onClick = onOpen, contentPadding = TinyButton, modifier = Modifier.fillMaxWidth().height(30.dp)) {
                Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 11.sp)
            }
        } else {
            Button(
                onClick = onOpen,
                contentPadding = TinyButton,
                modifier = Modifier.fillMaxWidth().height(30.dp),
                colors = ButtonDefaults.buttonColors(containerColor = color, contentColor = Color.White)
            ) {
                Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 11.sp)
            }
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = onDismiss,
            modifier = Modifier.width(280.dp)
        ) {
            options.forEach { (value, text, itemColor) ->
                DropdownMenuItem(
                    text = {
                        Surface(
                            color = itemColor,
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text,
                                color = Color.White,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp)
                            )
                        }
                    },
                    onClick = { onPick(value) },
                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 3.dp)
                )
            }
        }
    }
}

private fun callScript(punjabi: Boolean, callerName: String): String {
    val name = callerName.ifBlank { "____" }
    return if (punjabi) {
        "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਮੈਂ $name ਹਾਂ। ਮੈਂ ਆਮ ਆਦਮੀ ਪਾਰਟੀ ਵੱਲੋਂ ਗੱਲ ਕਰ ਰਿਹਾ ਹਾਂ। ਇਹ ਕਾਲ ਜਸ਼ਨ-ਏ-ਇਨਕਲਾਬ ਸਮਾਗਮ ਬਾਰੇ ਹੈ।"
    } else {
        "Hello, I am $name calling on behalf of the Aam Aadmi Party. I am calling you regarding the Jashan-e-Inquilab event."
    }
}

private fun JSONObject.toCallRow() = CallRow(
    id = optString("id"),
    serial = optInt("serial"),
    name = optString("name"),
    phone = optString("phone"),
    vehicleNumber = optString("vehicleNumber"),
    villageWard = optString("villageWard"),
    outcome = optString("outcome"),
    attending = optString("attending"),
    companions = optString("companions"),
)
