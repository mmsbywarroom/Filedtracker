package `in`.videh.filedtracker.nativeapp.compose

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Translate
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import `in`.videh.filedtracker.nativeapp.ApiClient
import `in`.videh.filedtracker.nativeapp.AppConfig
import `in`.videh.filedtracker.nativeapp.LocaleHelper
import `in`.videh.filedtracker.nativeapp.OtpSmsBus
import `in`.videh.filedtracker.nativeapp.R
import `in`.videh.filedtracker.nativeapp.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun LoginScreen(onLoggedIn: () -> Unit) {
    val context = LocalContext.current
    val activity = context.findActivity()
    val scope = rememberCoroutineScope()

    var phone by remember { mutableStateOf("") }
    var otp by remember { mutableStateOf("") }
    var otpSent by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var isError by remember { mutableStateOf(false) }
    var pendingOtpSend by remember { mutableStateOf(false) }

    val incomingOtp = OtpSmsBus.code
    LaunchedEffect(incomingOtp, otpSent) {
        val code = incomingOtp ?: return@LaunchedEffect
        if (otpSent) {
            otp = code
            OtpSmsBus.consume()
        }
    }

    fun sendOtpNow() {
        busy = true
        message = "Sending OTP…"
        scope.launch {
            try {
                withContext(Dispatchers.IO) { ApiClient.requestOtp(phone) }
                otpSent = true
                message = context.getString(R.string.otp_sms_hint)
            } catch (e: Exception) {
                isError = true
                message = errorText(e, "Could not send OTP")
            } finally {
                busy = false
            }
        }
    }

    val smsPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {
        if (pendingOtpSend) {
            pendingOtpSend = false
            sendOtpNow()
        }
    }

    val glow = rememberInfiniteTransition(label = "glow")
    val glowScale by glow.animateFloat(
        initialValue = 0.96f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(
            animation = tween(2600, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "glowScale"
    )

    Column(
        Modifier
            .fillMaxSize()
            .systemBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            IconButton(onClick = {
                val next = if (LocaleHelper.currentLang(context) == "pa") "en" else "pa"
                LocaleHelper.setLanguage(context, next)
                activity?.recreate()
            }) {
                Icon(Icons.Filled.Translate, stringResource(R.string.language), tint = AapColors.TextMuted)
            }
        }

        Spacer(Modifier.height(12.dp))

        Box(contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(150.dp)
                    .scale(glowScale)
                    .clip(RoundedCornerShape(75.dp))
                    .background(
                        Brush.radialGradient(
                            listOf(AapColors.Yellow.copy(alpha = 0.22f), Color.Transparent)
                        )
                    )
            )
            AapBrandMark(size = 88)
        }

        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.login_title),
            style = MaterialTheme.typography.displaySmall,
            color = AapColors.TextPrimary,
            textAlign = TextAlign.Center
        )
        Text(
            stringResource(R.string.login_subtitle),
            style = MaterialTheme.typography.titleMedium,
            color = AapColors.Yellow,
            letterSpacing = 3.sp
        )
        Spacer(Modifier.height(10.dp))
        AapAccentBar()

        Spacer(Modifier.height(28.dp))

        AnimatedVisibility(
            visible = true,
            enter = fadeIn(tween(500)) + slideInVertically(tween(500)) { it / 4 }
        ) {
            AapCard(Modifier.fillMaxWidth()) {
                Column {
                    Text(
                        if (otpSent) stringResource(R.string.login_otp_title)
                        else stringResource(R.string.login_with_mobile),
                        style = MaterialTheme.typography.titleLarge,
                        color = AapColors.TextPrimary
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (otpSent) stringResource(R.string.login_otp_hint)
                        else stringResource(R.string.login_number_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = AapColors.TextMuted
                    )
                    Spacer(Modifier.height(18.dp))

                    OutlinedTextField(
                        value = phone,
                        onValueChange = { new -> if (new.length <= 10 && new.all { it.isDigit() }) phone = new },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !otpSent && !busy,
                        singleLine = true,
                        label = { Text(stringResource(R.string.mobile_number)) },
                        leadingIcon = { Icon(Icons.Filled.Phone, null, tint = AapColors.Yellow) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                        shape = RoundedCornerShape(16.dp),
                        colors = aapFieldColors()
                    )

                    AnimatedVisibility(
                        visible = otpSent,
                        enter = fadeIn() + expandVertically(),
                        exit = fadeOut() + shrinkVertically()
                    ) {
                        Column {
                            Spacer(Modifier.height(14.dp))
                            OutlinedTextField(
                                value = otp,
                                onValueChange = { new -> if (new.length <= 6 && new.all { it.isDigit() }) otp = new },
                                modifier = Modifier.fillMaxWidth(),
                                enabled = !busy,
                                singleLine = true,
                                label = { Text(stringResource(R.string.otp_label)) },
                                leadingIcon = { Icon(Icons.Filled.LockOpen, null, tint = AapColors.Yellow) },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                shape = RoundedCornerShape(16.dp),
                                colors = aapFieldColors()
                            )
                        }
                    }

                    Spacer(Modifier.height(20.dp))

                    Button(
                        onClick = {
                            if (busy) return@Button
                            isError = false
                            if (!otpSent) {
                                if (phone.length != 10) {
                                    isError = true
                                    message = "Enter a valid 10-digit mobile number."
                                    return@Button
                                }
                                val smsOk = ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.RECEIVE_SMS
                                ) == PackageManager.PERMISSION_GRANTED
                                if (!smsOk) {
                                    pendingOtpSend = true
                                    smsPermissionLauncher.launch(Manifest.permission.RECEIVE_SMS)
                                    return@Button
                                }
                                sendOtpNow()
                            } else {
                                if (otp.length != 6) {
                                    isError = true
                                    message = "Enter the 6-digit OTP."
                                    return@Button
                                }
                                busy = true
                                message = "Verifying…"
                                scope.launch {
                                    try {
                                        val res = withContext(Dispatchers.IO) { ApiClient.verifyOtp(phone, otp) }
                                        val token = res.optString("token", "")
                                        val apiBase = res.optString("apiBaseUrl", AppConfig.API_BASE)
                                        if (token.isBlank()) throw IllegalStateException("No session token returned.")
                                        SessionStore.save(context, token, apiBase, phone, "")
                                        onLoggedIn()
                                    } catch (e: Exception) {
                                        isError = true
                                        message = errorText(e, "Verification failed")
                                    } finally {
                                        busy = false
                                    }
                                }
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        enabled = !busy,
                        shape = RoundedCornerShape(18.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AapColors.Yellow,
                            contentColor = AapColors.Navy,
                            disabledContainerColor = AapColors.Yellow.copy(alpha = 0.45f),
                            disabledContentColor = AapColors.Navy.copy(alpha = 0.6f)
                        ),
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = 8.dp, pressedElevation = 2.dp)
                    ) {
                        if (busy) {
                            CircularProgressIndicator(
                                Modifier.size(20.dp),
                                color = AapColors.Navy,
                                strokeWidth = 2.dp
                            )
                            Spacer(Modifier.size(12.dp))
                        } else {
                            Icon(Icons.AutoMirrored.Filled.Send, null, Modifier.size(20.dp))
                            Spacer(Modifier.size(10.dp))
                        }
                        Text(
                            if (otpSent) stringResource(R.string.verify_otp) else stringResource(R.string.send_otp),
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp
                        )
                    }

                    AnimatedVisibility(visible = otpSent && !busy) {
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center
                        ) {
                            TextButton(onClick = {
                                otpSent = false
                                otp = ""
                                message = ""
                            }) {
                                Text(stringResource(R.string.change_number), color = AapColors.BlueSoft)
                            }
                        }
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
                modifier = Modifier.padding(top = 16.dp),
                color = if (isError) AapColors.Danger else AapColors.TextMuted,
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
        }

        Spacer(Modifier.height(28.dp))
        Text(
            stringResource(R.string.secure_footer),
            style = MaterialTheme.typography.labelMedium,
            color = AapColors.TextMuted.copy(alpha = 0.7f)
        )
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun aapFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = AapColors.TextPrimary,
    unfocusedTextColor = AapColors.TextPrimary,
    focusedBorderColor = AapColors.Yellow,
    unfocusedBorderColor = AapColors.Outline,
    disabledBorderColor = AapColors.Outline,
    disabledTextColor = AapColors.TextMuted,
    focusedLabelColor = AapColors.Yellow,
    unfocusedLabelColor = AapColors.TextMuted,
    disabledLabelColor = AapColors.TextMuted,
    cursorColor = AapColors.Yellow,
    focusedContainerColor = AapColors.Navy.copy(alpha = 0.5f),
    unfocusedContainerColor = AapColors.Navy.copy(alpha = 0.35f),
    disabledContainerColor = AapColors.Navy.copy(alpha = 0.25f)
)
