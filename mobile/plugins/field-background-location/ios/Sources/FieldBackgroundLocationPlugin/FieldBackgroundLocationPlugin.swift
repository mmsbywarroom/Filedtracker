import Foundation
import Capacitor
import CoreLocation

@objc(FieldBackgroundLocationPlugin)
public class FieldBackgroundLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FieldBackgroundLocationPlugin"
    public let jsName = "FieldBackgroundLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTracking", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isTracking", returnType: CAPPluginReturnPromise),
    ]

    private let tracker = FieldLocationTracker.shared

    @objc func startTracking(_ call: CAPPluginCall) {
        guard let apiBase = call.getString("apiBaseUrl"),
              let token = call.getString("authToken"),
              let punchInAt = call.getString("punchInAt") else {
            call.reject("apiBaseUrl, authToken, and punchInAt are required")
            return
        }
        tracker.start(apiBase: apiBase, token: token, punchInAt: punchInAt)
        call.resolve(["ok": true])
    }

    @objc func stopTracking(_ call: CAPPluginCall) {
        tracker.stop()
        call.resolve(["ok": true])
    }

    @objc func isTracking(_ call: CAPPluginCall) {
        call.resolve(["active": tracker.isActive])
    }
}
