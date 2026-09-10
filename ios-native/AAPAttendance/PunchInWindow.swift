import Foundation

/// Matches server `punchInWindow.ts`: punch-in from 7:00 AM IST through end of day
/// (including after 1:00 PM). Before 7:00 AM blocked unless unrestricted phone.
enum PunchInWindow {
    private static let startMinutes = 7 * 60
    private static let unrestrictedPhone = "9625692122"
    private static let ist = TimeZone(identifier: "Asia/Kolkata")!

    static func isUnrestrictedPhone(_ phone: String?) -> Bool {
        guard var digits = phone?.filter(\.isNumber), !digits.isEmpty else { return false }
        if digits.count > 10 { digits = String(digits.suffix(10)) }
        return digits == unrestrictedPhone
    }

    static func isAllowed(phone: String? = nil, now: Date = Date()) -> Bool {
        if isUnrestrictedPhone(phone ?? SessionStore.phone) { return true }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = ist
        let hour = cal.component(.hour, from: now)
        let minute = cal.component(.minute, from: now)
        return hour * 60 + minute >= startMinutes
    }

    static var blockedMessage: String {
        "Punch in is allowed from 7:00 AM IST onward (including after 1:00 PM). Punch-in before 7:00 AM is not allowed."
    }
}
