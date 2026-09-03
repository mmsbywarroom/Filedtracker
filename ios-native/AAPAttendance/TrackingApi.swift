import Foundation

enum TrackingApi {
    static func postJSON(path: String, body: [String: Any], completion: ((Bool) -> Void)? = nil) {
        let base = SessionStore.apiBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + path), !SessionStore.token.isEmpty else {
            completion?(false)
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(SessionStore.token)", forHTTPHeaderField: "Authorization")
        req.setValue("native", forHTTPHeaderField: "X-Client-Source")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 25
        URLSession.shared.dataTask(with: req) { _, res, _ in
            let code = (res as? HTTPURLResponse)?.statusCode ?? 0
            completion?(code >= 200 && code < 300 || code == 429)
        }.resume()
    }

    static func postIntervalSnapshot(slot: Int, lat: Double, lng: Double, completion: ((Bool) -> Void)? = nil) {
        postJSON(path: "/api/attendance/interval-snapshot", body: [
            "slot": slot,
            "lat": lat,
            "lng": lng,
        ], completion: completion)
    }

    static func postHeartbeat(lat: Double, lng: Double) {
        postJSON(path: "/api/attendance/track", body: [
            "points": [] as [Any],
            "heartbeat": ["lat": lat, "lng": lng],
        ])
    }

    static func postTrack(lat: Double, lng: Double, accuracy: Double) {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        postJSON(path: "/api/attendance/track", body: [
            "points": [[
                "lat": lat,
                "lng": lng,
                "recordedAt": iso.string(from: Date()),
                "accuracy": accuracy,
            ]],
            "heartbeat": ["lat": lat, "lng": lng],
        ])
    }

    static func postGpsOff(lat: Double, lng: Double) {
        postJSON(path: "/api/attendance/gps-off", body: [
            "lat": lat,
            "lng": lng,
            "address": "GPS turned off",
        ])
    }

    static func postSecurityEvent(type: String, action: String, detail: String, lat: Double? = nil, lng: Double? = nil) {
        var body: [String: Any] = [
            "type": type,
            "action": action,
            "detail": detail,
        ]
        if let lat { body["lat"] = lat }
        if let lng { body["lng"] = lng }
        postJSON(path: "/api/attendance/security-event", body: body)
    }
}
