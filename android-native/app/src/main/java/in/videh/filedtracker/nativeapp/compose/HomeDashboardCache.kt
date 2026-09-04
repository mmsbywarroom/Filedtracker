package `in`.videh.filedtracker.nativeapp.compose

import org.json.JSONObject

/**
 * Survives Camera/Face navigation. HomeScreen is disposed when opening the camera;
 * without this cache every return shows Loading… / Register face until /api/me finishes.
 */
object HomeDashboardCache {
    @Volatile
    var user: JSONObject? = null

    @Volatile
    var openSession: JSONObject? = null

    @Volatile
    var todayDistance: Double = 0.0

    @Volatile
    var todayHours: Double = 0.0

    @Volatile
    var bootstrapped: Boolean = false

    fun clear() {
        user = null
        openSession = null
        todayDistance = 0.0
        todayHours = 0.0
        bootstrapped = false
    }

    fun applyMeAndAttendance(me: JSONObject, attendance: JSONObject) {
        user = me.optJSONObject("user")
        openSession = attendance.optJSONObject("open")
        todayDistance = attendance.optDouble("todayDistanceMeters", 0.0)
        todayHours = attendance.optDouble("todayHoursWorked", 0.0)
        if (user != null) bootstrapped = true
    }

    fun applyPunchIn(attendanceObj: JSONObject?) {
        if (attendanceObj != null) openSession = attendanceObj
        bootstrapped = true
    }

    fun applyPunchOut() {
        openSession = null
        bootstrapped = true
    }

    fun markFaceRegistered() {
        val u = user ?: return
        try {
            if (!u.has("faceRegisteredAt") || u.isNull("faceRegisteredAt")) {
                u.put("faceRegisteredAt", System.currentTimeMillis().toString())
            }
            user = u
        } catch (_: Exception) {
        }
        bootstrapped = true
    }
}
