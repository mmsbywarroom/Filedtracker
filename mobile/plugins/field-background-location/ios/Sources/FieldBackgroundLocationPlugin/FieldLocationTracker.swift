import Foundation
import CoreLocation

final class FieldLocationTracker: NSObject, CLLocationManagerDelegate {
    static let shared = FieldLocationTracker()

    private let manager = CLLocationManager()
    private var timer: Timer?
    private var lastHeartbeatAt: TimeInterval = 0
    private(set) var isActive = false

    private var apiBase = ""
    private var token = ""
    private var punchInMs: TimeInterval = 0
    private var sentSlots = Set<Int>()
    private var lastLat: Double?
    private var lastLng: Double?
    private var lastTickAt: TimeInterval = 0

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
    }

    func start(apiBase: String, token: String, punchInAt: String) {
        self.apiBase = apiBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        self.token = token
        self.sentSlots = []
        self.punchInMs = ISO8601DateFormatter().date(from: punchInAt)?.timeIntervalSince1970 ?? 0
        self.isActive = true

        manager.requestAlwaysAuthorization()
        manager.startUpdatingLocation()

        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            self?.tick()
        }
        if let timer { RunLoop.main.add(timer, forMode: .common) }
        tick()
    }

    func stop() {
        isActive = false
        timer?.invalidate()
        timer = nil
        manager.stopUpdatingLocation()
        apiBase = ""
        token = ""
        punchInMs = 0
        sentSlots = []
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        lastLat = loc.coordinate.latitude
        lastLng = loc.coordinate.longitude
        let now = Date().timeIntervalSince1970
        if now - lastTickAt >= 60 {
            lastTickAt = now
            tick()
        }
    }

    private func tick() {
        guard isActive, punchInMs > 0, !apiBase.isEmpty, !token.isEmpty else { return }
        guard let lat = lastLat, let lng = lastLng else { return }

        let now = Date().timeIntervalSince1970
        if now - lastHeartbeatAt >= 120 {
            lastHeartbeatAt = now
            postHeartbeat(lat: lat, lng: lng)
        }

        if let slot = findDueSlot(now: now) {
            postSnapshot(slot: slot, lat: lat, lng: lng)
        }
    }

    private func findDueSlot(now: TimeInterval) -> Int? {
        for slot in 1...24 {
            if sentSlots.contains(slot) { continue }
            if isSlotDue(punchInMs: punchInMs, slot: slot, now: now) {
                return slot
            }
        }
        return nil
    }

    private func isSlotDue(punchInMs: TimeInterval, slot: Int, now: TimeInterval) -> Bool {
        let interval: TimeInterval = 30 * 60
        let early: TimeInterval = 2 * 60
        let late: TimeInterval = 15 * 60
        let due = punchInMs + Double(slot) * interval
        return now >= due - early && now <= due + late
    }

    private func postSnapshot(slot: Int, lat: Double, lng: Double) {
        guard let url = URL(string: "\(apiBase)/api/attendance/interval-snapshot") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let body: [String: Any] = ["slot": slot, "lat": lat, "lng": lng]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: req) { [weak self] _, response, _ in
            guard let self else { return }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code >= 200 && code < 300 || code == 429 {
                DispatchQueue.main.async { self.sentSlots.insert(slot) }
            }
        }.resume()
    }

    private func postHeartbeat(lat: Double, lng: Double) {
        guard let url = URL(string: "\(apiBase)/api/attendance/track") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let body: [String: Any] = [
            "points": [],
            "heartbeat": ["lat": lat, "lng": lng],
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req).resume()
    }
}
