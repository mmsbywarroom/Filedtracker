import CoreLocation
import Darwin
import Foundation
import Network

enum SecurityHelper {
    private static var pathMonitor: NWPathMonitor?
    private static var pathHintVpn = false
    private static let pathQueue = DispatchQueue(label: "in.videh.filedtracker.vpnpath")

    /// Start once at app launch so VPN path state stays fresh.
    static func startMonitoring() {
        guard pathMonitor == nil else { return }
        let monitor = NWPathMonitor()
        pathMonitor = monitor
        monitor.pathUpdateHandler = { path in
            // Hint only — confirmed by CFNetwork / interfaces below.
            pathHintVpn = path.availableInterfaces.contains { $0.type == .other }
        }
        monitor.start(queue: pathQueue)
    }

    /// VPN tunnel currently up (same intent as Android isVpnActive).
    static func isVpnActive() -> Bool {
        if hasVpnScopedProxy() { return true }
        if hasVpnNetworkInterface() { return true }
        // Soft hint from NWPath + scoped re-check
        return pathHintVpn && hasVpnScopedProxy()
    }

    /// Fake / simulated GPS (Android Location.isMock equivalent on iOS).
    static func isMockLocation(_ loc: CLLocation) -> Bool {
        if #available(iOS 15.0, *) {
            if let info = loc.sourceInformation {
                if info.isSimulatedBySoftware { return true }
                if info.isProducedByAccessory { return true }
            }
        }
        return false
    }

    /// Mid-session auto punch-out: Fake GPS (simulated) OR VPN active.
    static func shouldAutoPunchOutForSecurity(lastLocation: CLLocation?) -> Bool {
        if let loc = lastLocation, isMockLocation(loc) { return true }
        return isVpnActive()
    }

    /// "fake_gps" or "vpn" for security-punch-out API.
    static func autoPunchOutReason(lastLocation: CLLocation?) -> String {
        if let loc = lastLocation, isMockLocation(loc) { return "fake_gps" }
        if isVpnActive() { return "vpn" }
        return "fake_gps"
    }

    /// True when Fake GPS should force auto punch-out during an open session.
    static func shouldAutoPunchOutForFakeGps(lastLocation: CLLocation?) -> Bool {
        shouldAutoPunchOutForSecurity(lastLocation: lastLocation)
    }

    /// Throws if VPN or Fake GPS should block punch-in / punch-out (Android assertSecureForPunch).
    static func assertSecureForPunch(lastLocation: CLLocation?) throws {
        guard let loc = lastLocation else {
            throw securityError(
                "Could not verify GPS location. Turn on Location and try again."
            )
        }
        let vpn = isVpnActive()
        let mock = isMockLocation(loc)
        reportPunchEvidence(location: loc, vpn: vpn, mock: mock)

        if mock {
            TrackingApi.postSecurityEvent(
                type: "mock_gps",
                action: "blocked",
                detail: "Punch blocked: Fake GPS / simulated location",
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude
            )
            throw securityError(
                "Punch blocked: Fake GPS / mock location detected. Turn it off completely, then try again."
            )
        }
        if vpn {
            TrackingApi.postSecurityEvent(
                type: "vpn",
                action: "blocked",
                detail: "Punch blocked: VPN on device",
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude
            )
            throw securityError(
                "Punch blocked: VPN detected. Turn off VPN, then try again."
            )
        }
    }

    /// JSON for WebView NativeAppBridge / dashboard assertNativeSecureForPunch.
    static func securityStatusJSON(lastLocation: CLLocation? = nil) -> String {
        let vpn = isVpnActive()
        let mock = lastLocation.map { isMockLocation($0) } ?? false
        var detail = ""
        if vpn { detail = "VPN connected on device" }
        if mock {
            detail = detail.isEmpty
                ? "Fake GPS / simulated location"
                : detail + " · Fake GPS / simulated location"
        }
        let obj: [String: Any] = [
            "vpn": vpn,
            "vpnActive": vpn,
            "spoofApp": mock,
            "spoofPackage": mock ? "simulated_location" : "",
            "vpnPackage": vpn ? "ios_vpn_tunnel" : "",
            "mockLikely": mock,
            "detail": detail,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: obj),
           let s = String(data: data, encoding: .utf8) {
            return s
        }
        return "{\"vpn\":false,\"vpnActive\":false,\"spoofApp\":false,\"spoofPackage\":\"\",\"vpnPackage\":\"\",\"mockLikely\":false,\"detail\":\"\"}"
    }

    // MARK: - Private

    private static func securityError(_ message: String) -> NSError {
        NSError(
            domain: "SecurityHelper",
            code: 403,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }

    private static func reportPunchEvidence(location: CLLocation, vpn: Bool, mock: Bool) {
        guard vpn || mock else { return }
        var apps: [String] = []
        if vpn { apps.append("VPN connected on device") }
        if mock { apps.append("Fake GPS / simulated location on GPS fix") }
        let detail =
            "Apps at native punch-in: \(apps.joined(separator: "; ")). Confirmed device evidence — third-party app(s) on phone when using native app."
        TrackingApi.postSecurityEvent(
            type: "punch_evidence",
            action: "punch_evidence",
            detail: detail,
            lat: location.coordinate.latitude,
            lng: location.coordinate.longitude
        )
    }

    /// CFNetwork __SCOPED__ keys — standard public VPN signal on iOS.
    private static func hasVpnScopedProxy() -> Bool {
        guard let cfDict = CFNetworkCopySystemProxySettings()?.takeRetainedValue() as? [String: Any],
              let scoped = cfDict["__SCOPED__"] as? [String: Any]
        else { return false }
        return scoped.keys.contains { key in
            let n = key.lowercased()
            return n.contains("tap")
                || n.contains("tun")
                || n.contains("ppp")
                || n.contains("ipsec")
                || n.hasPrefix("utun")
                || n.contains("wg")
                || n.contains("ikev2")
        }
    }

    /// Active tunnel-style interfaces (ppp / ipsec / wireguard).
    private static func hasVpnNetworkInterface() -> Bool {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return false }
        defer { freeifaddrs(ifaddr) }
        var ptr: UnsafeMutablePointer<ifaddrs>? = first
        while let p = ptr {
            defer { ptr = p.pointee.ifa_next }
            guard let nameC = p.pointee.ifa_name else { continue }
            let name = String(cString: nameC).lowercased()
            let flags = Int32(p.pointee.ifa_flags)
            let up = (flags & IFF_UP) != 0
            let running = (flags & IFF_RUNNING) != 0
            guard up && running else { continue }
            if name.hasPrefix("ppp") || name.hasPrefix("ipsec") || name.hasPrefix("wg") || name.hasPrefix("tap") {
                return true
            }
        }
        return false
    }
}
