package `in`.videh.filedtracker.nativeapp

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/** Latest 6-digit OTP captured from an incoming SMS. Login screen observes this. */
object OtpSmsBus {
    var code by mutableStateOf<String?>(null)
        private set

    fun offer(value: String) {
        if (value.length == 6 && value.all { it.isDigit() }) code = value
    }

    fun consume() {
        code = null
    }
}
