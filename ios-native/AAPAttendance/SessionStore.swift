import Foundation

enum SessionStore {
    private static let defaults = UserDefaults.standard
    private static let tokenKey = "ft_token"
    private static let apiBaseKey = "ft_api_base"
    private static let phoneKey = "ft_phone"
    private static let punchInKey = "ft_punch_in"
    private static let lastHourlyKey = "ft_last_hourly_security"
    private static let sentSlotsKey = "ft_sent_slots"

    static var token: String {
        get { defaults.string(forKey: tokenKey) ?? "" }
        set { defaults.set(newValue, forKey: tokenKey) }
    }

    static var apiBase: String {
        get {
            let v = defaults.string(forKey: apiBaseKey) ?? ""
            return v.isEmpty ? AppConfig.apiBase : v
        }
        set { defaults.set(newValue, forKey: apiBaseKey) }
    }

    static var phone: String {
        get { defaults.string(forKey: phoneKey) ?? "" }
        set { defaults.set(newValue, forKey: phoneKey) }
    }

    static var punchInAt: String {
        get { defaults.string(forKey: punchInKey) ?? "" }
        set { defaults.set(newValue, forKey: punchInKey) }
    }

    static var punchInMs: TimeInterval {
        guard !punchInAt.isEmpty else { return 0 }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: punchInAt) { return d.timeIntervalSince1970 }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: punchInAt)?.timeIntervalSince1970 ?? 0
    }

    static var lastHourlySecurityAt: TimeInterval {
        get { defaults.double(forKey: lastHourlyKey) }
        set { defaults.set(newValue, forKey: lastHourlyKey) }
    }

    static func save(token: String, apiBase: String, phone: String) {
        self.token = token
        self.apiBase = apiBase.isEmpty ? AppConfig.apiBase : apiBase
        if !phone.isEmpty { self.phone = phone }
    }

    static func hasSentSlot(_ slot: Int) -> Bool {
        let slots = defaults.array(forKey: sentSlotsKey) as? [Int] ?? []
        return slots.contains(slot)
    }

    static func markSlotSent(_ slot: Int) {
        var slots = defaults.array(forKey: sentSlotsKey) as? [Int] ?? []
        if !slots.contains(slot) { slots.append(slot) }
        defaults.set(slots, forKey: sentSlotsKey)
    }

    static func clearTracking() {
        punchInAt = ""
        lastHourlySecurityAt = 0
        defaults.removeObject(forKey: sentSlotsKey)
    }

    static func clearAll() {
        token = ""
        phone = ""
        clearTracking()
    }
}
