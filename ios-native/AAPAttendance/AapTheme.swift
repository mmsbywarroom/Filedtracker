import SwiftUI

enum AapTheme {
    static let navy = Color(red: 10 / 255, green: 22 / 255, blue: 40 / 255)
    static let navyDeep = Color(red: 6 / 255, green: 15 / 255, blue: 28 / 255)
    static let navyCard = Color(red: 22 / 255, green: 41 / 255, blue: 74 / 255)
    static let yellow = Color(red: 1, green: 209 / 255, blue: 0)
    static let yellowDim = Color(red: 224 / 255, green: 184 / 255, blue: 0)
    static let blue = Color(red: 26 / 255, green: 86 / 255, blue: 196 / 255)
    static let blueSoft = Color(red: 46 / 255, green: 107 / 255, blue: 224 / 255)
    static let textPrimary = Color(red: 244 / 255, green: 247 / 255, blue: 252 / 255)
    static let textMuted = Color(red: 155 / 255, green: 170 / 255, blue: 196 / 255)
    static let success = Color(red: 46 / 255, green: 204 / 255, blue: 143 / 255)
    static let danger = Color(red: 1, green: 92 / 255, blue: 92 / 255)
}

struct AapCard<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        content()
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AapTheme.navyCard.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }
}

struct AapBrandMark: View {
    var height: CGFloat = 56
    var body: some View {
        Image("AapLogo")
            .resizable()
            .scaledToFit()
            .frame(height: height)
    }
}

struct AapAccentBar: View {
    var body: some View {
        HStack(spacing: 3) {
            Capsule().fill(AapTheme.yellow).frame(width: 26, height: 4)
            Capsule().fill(AapTheme.blue).frame(width: 14, height: 4)
            Capsule().fill(AapTheme.textMuted.opacity(0.5)).frame(width: 8, height: 4)
        }
    }
}

struct AapScreenScaffold<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    var onBack: (() -> Void)? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                if let onBack {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                            .font(.title3.weight(.semibold))
                            .foregroundColor(AapTheme.textPrimary)
                            .frame(width: 44, height: 44)
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.title3.weight(.semibold)).foregroundColor(AapTheme.textPrimary)
                    if let subtitle {
                        Text(subtitle).font(.subheadline).foregroundColor(AapTheme.textMuted)
                    }
                }
                Spacer()
                AapBrandMark(height: 32)
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)
            AapAccentBar().padding(.leading, 20).padding(.bottom, 10)
            content()
        }
        .background(AapTheme.navyDeep.ignoresSafeArea())
    }
}

enum AapFormat {
    static let ist = TimeZone(identifier: "Asia/Kolkata")!

    static func prettyDistance(_ meters: Double) -> String {
        if meters >= 1000 { return String(format: "%.1f km", meters / 1000) }
        return String(format: "%.0f m", meters)
    }

    static func prettyTime(_ iso: String?) -> String {
        guard let date = parseISO(iso) else { return "—" }
        let f = DateFormatter()
        f.timeZone = ist
        f.dateFormat = "hh:mm a"
        return f.string(from: date)
    }

    static func prettyDate(_ iso: String?) -> String {
        guard let date = parseISO(iso) else { return "—" }
        let f = DateFormatter()
        f.timeZone = ist
        f.dateFormat = "dd MMM yyyy"
        return f.string(from: date)
    }

    static func prettyDuration(from: String?, to: String?) -> String {
        guard let start = parseISO(from) else { return "—" }
        let end = parseISO(to) ?? Date()
        let mins = max(0, Int(end.timeIntervalSince(start) / 60))
        if mins >= 60 { return "\(mins / 60)h \(mins % 60)m" }
        return "\(mins)m"
    }

    static func parseISO(_ value: String?) -> Date? {
        guard let value, !value.isEmpty, value != "null" else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: value) { return d }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: value)
    }
}
