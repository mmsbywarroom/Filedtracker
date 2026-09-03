package `in`.videh.filedtracker.nativeapp.compose

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.location.Location
import `in`.videh.filedtracker.nativeapp.LocationHelper
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Walks the context chain to the hosting Activity (needed by the Java helpers). */
fun Context.findActivity(): Activity? {
    var ctx: Context? = this
    while (ctx is ContextWrapper) {
        if (ctx is Activity) return ctx
        ctx = ctx.baseContext
    }
    return null
}

/** Suspending wrapper around [LocationHelper.getCurrentLocation]. */
suspend fun awaitLocation(activity: Activity): Location =
    suspendCancellableCoroutine { cont ->
        LocationHelper.getCurrentLocation(activity, object : LocationHelper.Callback {
            override fun onResult(loc: Location) {
                if (cont.isActive) cont.resume(loc)
            }

            override fun onError(message: String?) {
                if (cont.isActive) {
                    cont.resumeWithException(
                        IllegalStateException(message ?: "Could not get GPS location.")
                    )
                }
            }
        })
    }

/** Google Maps key injected into the manifest at build time; blank when not configured. */
fun mapsApiKey(context: Context): String = try {
    val ai = context.packageManager.getApplicationInfo(
        context.packageName,
        PackageManager.GET_META_DATA
    )
    ai.metaData?.getString("com.google.android.geo.API_KEY").orEmpty().trim()
} catch (e: Exception) {
    ""
}

private val isoParsers = listOf(
    "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
    "yyyy-MM-dd'T'HH:mm:ss'Z'",
    "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
    "yyyy-MM-dd'T'HH:mm:ssXXX",
    "yyyy-MM-dd"
)

private fun parseIso(value: String?): java.util.Date? {
    if (value.isNullOrBlank() || value == "null") return null
    for (pattern in isoParsers) {
        try {
            val fmt = SimpleDateFormat(pattern, Locale.US)
            if (pattern.endsWith("'Z'") || pattern == "yyyy-MM-dd") {
                fmt.timeZone = TimeZone.getTimeZone("UTC")
            }
            return fmt.parse(value)
        } catch (ignored: Exception) {
        }
    }
    return null
}

private fun formatIst(value: String?, pattern: String): String {
    val date = parseIso(value) ?: return "—"
    val out = SimpleDateFormat(pattern, Locale.US)
    out.timeZone = TimeZone.getTimeZone("Asia/Kolkata")
    return out.format(date)
}

fun prettyDateTime(value: String?): String = formatIst(value, "dd MMM yyyy, hh:mm a")

fun prettyDate(value: String?): String = formatIst(value, "dd MMM yyyy")

fun prettyTime(value: String?): String = formatIst(value, "hh:mm a")

fun prettyDistance(meters: Double): String =
    if (meters >= 1000) String.format(Locale.US, "%.1f km", meters / 1000.0)
    else String.format(Locale.US, "%.0f m", meters)

/** Duration between two ISO timestamps, e.g. "6h 12m". Blank end means "so far". */
fun prettyDuration(fromIso: String?, toIso: String?): String {
    val from = parseIso(fromIso) ?: return "—"
    val to = parseIso(toIso) ?: java.util.Date()
    val ms = (to.time - from.time).coerceAtLeast(0)
    val mins = ms / 60000
    return if (mins >= 60) "${mins / 60}h ${mins % 60}m" else "${mins}m"
}

/** JSON helpers that tolerate the `null` values Prisma sends back. */
fun JSONObject.stringOrNull(key: String): String? {
    if (!has(key) || isNull(key)) return null
    val v = optString(key, "")
    return v.ifBlank { null }
}

fun JSONObject.doubleOrNull(key: String): Double? {
    if (!has(key) || isNull(key)) return null
    val v = optDouble(key, Double.NaN)
    return if (v.isNaN()) null else v
}

fun JSONArray.objects(): List<JSONObject> =
    (0 until length()).mapNotNull { optJSONObject(it) }

fun errorText(e: Throwable, fallback: String): String =
    e.message?.takeIf { it.isNotBlank() } ?: fallback
