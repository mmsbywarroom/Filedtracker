import CoreLocation
import Foundation

enum SecurityHelper {
    static func isVpnActive() -> Bool {
        guard let cfDict = CFNetworkCopySystemProxySettings()?.takeRetainedValue() as? [String: Any],
              let scoped = cfDict["__SCOPED__"] as? [String: Any]
        else { return false }
        return scoped.keys.contains { k in
            let n = k.lowercased()
            return n.contains("tap") || n.contains("tun") || n.contains("ppp")
                || n.contains("ipsec") || n.contains("utun") || n.contains("wg")
        }
    }

    static func isMockLocation(_ loc: CLLocation) -> Bool {
        if #available(iOS 15.0, *) {
            return loc.sourceInformation?.isSimulatedBySoftware == true
        }
        return false
    }

    static func securityStatusJSON(lastLocation: CLLocation? = nil) -> String {
        let vpn = isVpnActive()
        let mock = lastLocation.map { isMockLocation($0) } ?? false
        var detail = ""
        if vpn { detail = "VPN connected on device" }
        if mock {
            detail = detail.isEmpty ? "Fake GPS / simulated location" : detail + " · Fake GPS / simulated location"
        }
        let obj: [String: Any] = [
            "vpn": vpn || mock,
            "vpnActive": vpn,
            "spoofApp": mock,
            "spoofPackage": mock ? "simulated_location" : "",
            "vpnPackage": "",
            "mockLikely": mock,
            "detail": detail,
        ]
        if let data = try? JSONSerialization.data(withJSONObject: obj),
           let s = String(data: data, encoding: .utf8) {
            return s
        }
        return "{\"vpn\":false,\"vpnActive\":false,\"spoofApp\":false,\"spoofPackage\":\"\",\"vpnPackage\":\"\",\"mockLikely\":false,\"detail\":\"\"}"
    }
}
