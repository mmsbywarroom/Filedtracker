package `in`.videh.filedtracker.nativeapp.compose

import android.app.DatePickerDialog
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import `in`.videh.filedtracker.nativeapp.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

@Composable
fun LeaveScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var leaves by remember { mutableStateOf<List<JSONObject>>(emptyList()) }
    var fromDate by remember { mutableStateOf("") }
    var toDate by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }
    var reloadKey by remember { mutableStateOf(0) }

    LaunchedEffect(reloadKey) {
        loading = true
        try {
            val res = withContext(Dispatchers.IO) { ApiClient(context).getLeave() }
            leaves = res.optJSONArray("leaves")?.objects().orEmpty()
        } catch (e: Exception) {
            message = errorText(e, "Could not load leave requests")
            isError = true
        } finally {
            loading = false
        }
    }

    fun pickDate(current: String, onPicked: (String) -> Unit) {
        val cal = Calendar.getInstance()
        if (current.isNotBlank()) {
            try {
                cal.time = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(current)!!
            } catch (ignored: Exception) {
            }
        }
        DatePickerDialog(
            context,
            { _, year, month, day ->
                onPicked(String.format(Locale.US, "%04d-%02d-%02d", year, month + 1, day))
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        ).show()
    }

    AapScreenScaffold(
        title = "Leave request",
        subtitle = "Apply and track approvals",
        onBack = onBack
    ) {
        Column(
            Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
        ) {
            AapCard(Modifier.fillMaxWidth()) {
                Column {
                    Text("New request", style = MaterialTheme.typography.titleLarge, color = AapColors.TextPrimary)
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        DateField(
                            label = "From",
                            value = fromDate,
                            modifier = Modifier.weight(1f),
                            onClick = { pickDate(fromDate) { fromDate = it } }
                        )
                        DateField(
                            label = "To",
                            value = toDate,
                            modifier = Modifier.weight(1f),
                            onClick = { pickDate(toDate.ifBlank { fromDate }) { toDate = it } }
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = reason,
                        onValueChange = { reason = it },
                        modifier = Modifier.fillMaxWidth().height(112.dp),
                        label = { Text("Reason") },
                        enabled = !busy,
                        shape = RoundedCornerShape(16.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = AapColors.TextPrimary,
                            unfocusedTextColor = AapColors.TextPrimary,
                            focusedBorderColor = AapColors.Yellow,
                            unfocusedBorderColor = AapColors.Outline,
                            focusedLabelColor = AapColors.Yellow,
                            unfocusedLabelColor = AapColors.TextMuted,
                            cursorColor = AapColors.Yellow,
                            focusedContainerColor = AapColors.Navy.copy(alpha = 0.5f),
                            unfocusedContainerColor = AapColors.Navy.copy(alpha = 0.35f)
                        )
                    )
                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = {
                            if (busy) return@Button
                            if (fromDate.isBlank() || toDate.isBlank()) {
                                isError = true
                                message = "Pick both dates."
                                return@Button
                            }
                            if (reason.trim().length < 3) {
                                isError = true
                                message = "Enter a reason (at least 3 letters)."
                                return@Button
                            }
                            busy = true
                            isError = false
                            message = "Submitting…"
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) {
                                        ApiClient(context).createLeave(fromDate, toDate, reason.trim())
                                    }
                                    message = "Leave request submitted."
                                    reason = ""
                                    fromDate = ""
                                    toDate = ""
                                    reloadKey++
                                } catch (e: Exception) {
                                    isError = true
                                    message = errorText(e, "Could not submit leave request")
                                } finally {
                                    busy = false
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        enabled = !busy,
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AapColors.Yellow,
                            contentColor = AapColors.Navy
                        ),
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp)
                    ) {
                        if (busy) {
                            CircularProgressIndicator(Modifier.size(18.dp), color = AapColors.Navy, strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.AutoMirrored.Filled.Send, null, Modifier.size(18.dp))
                            Spacer(Modifier.size(10.dp))
                            Text("Submit request", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            AnimatedVisibility(
                visible = message.isNotBlank(),
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                Text(
                    message,
                    Modifier.padding(top = 12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isError) AapColors.Danger else AapColors.Success
                )
            }

            Spacer(Modifier.height(22.dp))
            Text("YOUR REQUESTS", style = MaterialTheme.typography.labelMedium, color = AapColors.TextMuted)
            Spacer(Modifier.height(10.dp))

            if (loading) {
                Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AapColors.Yellow)
                }
            } else if (leaves.isEmpty()) {
                AapCard(Modifier.fillMaxWidth()) {
                    Text(
                        "No leave requests yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = AapColors.TextMuted
                    )
                }
            } else {
                leaves.forEach { leave ->
                    LeaveRow(leave)
                    Spacer(Modifier.height(10.dp))
                }
            }
            Spacer(Modifier.height(28.dp))
        }
    }
}

@Composable
private fun DateField(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = AapColors.Navy.copy(alpha = 0.5f),
        border = null
    ) {
        Row(
            Modifier.padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.CalendarMonth, null, Modifier.size(18.dp), tint = AapColors.Yellow)
            Spacer(Modifier.size(10.dp))
            Column {
                Text(label, style = MaterialTheme.typography.labelMedium, color = AapColors.TextMuted)
                Text(
                    value.ifBlank { "Select" },
                    style = MaterialTheme.typography.titleMedium,
                    color = if (value.isBlank()) AapColors.TextMuted else AapColors.TextPrimary
                )
            }
        }
    }
}

@Composable
private fun LeaveRow(leave: JSONObject) {
    val status = leave.stringOrNull("status") ?: "pending"
    val tint = when (status) {
        "approved" -> AapColors.Success
        "rejected" -> AapColors.Danger
        else -> AapColors.Yellow
    }
    AapCard(Modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${prettyDate(leave.stringOrNull("fromDate"))} → ${prettyDate(leave.stringOrNull("toDate"))}",
                    style = MaterialTheme.typography.titleMedium,
                    color = AapColors.TextPrimary,
                    modifier = Modifier.weight(1f)
                )
                Surface(shape = RoundedCornerShape(50), color = tint.copy(alpha = 0.16f)) {
                    Text(
                        status.uppercase(Locale.US),
                        Modifier.padding(horizontal = 12.dp, vertical = 5.dp),
                        style = MaterialTheme.typography.labelMedium,
                        color = tint
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(
                leave.stringOrNull("reason") ?: "",
                style = MaterialTheme.typography.bodyMedium,
                color = AapColors.TextMuted
            )
            leave.stringOrNull("adminNote")?.let {
                Spacer(Modifier.height(6.dp))
                Text("Note: $it", style = MaterialTheme.typography.bodyMedium, color = Color(0xFFB9C8E0))
            }
        }
    }
}
