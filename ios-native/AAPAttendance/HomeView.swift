import SwiftUI
import CoreLocation

enum FaceMode: String {
    case register, punchIn = "punch_in", punchOut = "punch_out", check
}

struct HomeView: View {
    var onLoggedOut: () -> Void
    @StateObject private var gps = LocationFixHolder()
    @State private var user: [String: Any]?
    @State private var open: [String: Any]?
    @State private var todayDistance = 0.0
    @State private var todayHours = 0.0
    @State private var priorClosedMs = 0.0
    @State private var openDistance = 0.0
    @State private var loading = true
    @State private var busy = false
    @State private var message = ""
    @State private var isError = false
    @State private var gpsText = ""
    @State private var langTick = 0
    @State private var route: FaceMode?
    @State private var mapOpen = false
    @State private var leaveOpen = false
    @State private var printsOpen = false
    @State private var lastPunchLoc: CLLocation?
    @State private var nowTick = Date()
    @State private var localDistanceTick = 0

    private let clock = Timer.publish(every: 15, on: .main, in: .common).autoconnect()

    private var faceRegistered: Bool {
        guard let v = user?["faceRegisteredAt"] else { return false }
        if v is NSNull { return false }
        if let s = v as? String { return !s.isEmpty && s != "null" }
        if let n = v as? NSNumber { return n.doubleValue > 0 }
        return true
    }
    private var punchedIn: Bool { open != nil }

    private var displayDistance: Double {
        _ = localDistanceTick
        let local = LocationTracker.shared.localTravelMeters
        let openPart = max(openDistance, local)
        let other = max(0, todayDistance - openDistance)
        return max(todayDistance, other + openPart)
    }

    private var displayHours: Double {
        var ms = priorClosedMs
        if punchedIn, let pin = open?.string("punchInAt"), let start = AapFormat.parseISO(pin) {
            ms += max(0, nowTick.timeIntervalSince(start) * 1000)
        } else {
            return todayHours
        }
        return ms / 3_600_000
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                statusPill
                statsHero
                if !loading && !faceRegistered && !punchedIn {
                    registerCard
                }
                if loading && user == nil && open == nil {
                    ProgressView().tint(AapTheme.yellow).frame(maxWidth: .infinity).padding(40)
                } else if faceRegistered || punchedIn {
                    punchButton
                }
                if !PunchInWindow.isAllowed() && !punchedIn {
                    Text(LocaleStore.t(PunchInWindow.blockedMessage, PunchInWindow.blockedMessage))
                        .font(.caption.weight(.medium))
                        .foregroundColor(AapTheme.yellow)
                        .padding(.horizontal, 4)
                }
                if !gpsText.isEmpty {
                    Text(gpsText).font(.caption2).foregroundColor(AapTheme.textMuted)
                }
                if !message.isEmpty {
                    Text(message)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(isError ? AapTheme.danger : AapTheme.success)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background((isError ? AapTheme.danger : AapTheme.success).opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                Text(LocaleStore.t("QUICK ACTIONS", "ਤੇਜ਼ ਕਾਰਵਾਈਆਂ"))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(AapTheme.textMuted)
                    .tracking(1.6)
                    .padding(.top, 4)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                    action(LocaleStore.t("Live map", "ਲਾਈਵ ਨਕਸ਼ਾ"), LocaleStore.t("Your route today", "ਅੱਜ ਦਾ ਰਸਤਾ"), "map") { mapOpen = true }
                    action(LocaleStore.t("Footprints", "ਰਸਤੇ"), LocaleStore.t("Past sessions", "ਪਿਛਲੀਆਂ ਸੈਸ਼ਨ"), "point.topleft.down.curvedto.point.bottomright.up") { printsOpen = true }
                    action(LocaleStore.t("Leave", "ਛੁੱਟੀ"), LocaleStore.t("Apply & track", "ਬੇਨਤੀ ਤੇ ਸਥਿਤੀ"), "calendar") { leaveOpen = true }
                    action(LocaleStore.t("Face check", "ਚਿਹਰਾ ਜਾਂਚ"), LocaleStore.t("Camera self-test", "ਕੈਮਰਾ ਟੈਸਟ"), "faceid") { route = .check }
                }
                Button {
                    LocationTracker.shared.stop()
                    SessionStore.clearAll()
                    onLoggedOut()
                } label: {
                    Label(LocaleStore.t("Logout", "ਲਾਗਆਉਟ"), systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity).frame(height: 48)
                        .foregroundColor(AapTheme.textMuted)
                        .background(AapTheme.navyCard.opacity(0.45))
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .padding(.bottom, 28)
            }
            .padding(.horizontal, 20)
            .padding(.top, 10)
        }
        .id(langTick)
        .background(
            LinearGradient(
                colors: [AapTheme.navyDeep, Color(red: 8 / 255, green: 20 / 255, blue: 42 / 255), AapTheme.navyDeep],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
        )
        .task { await reload() }
        .onReceive(clock) { date in
            nowTick = date
            if punchedIn { localDistanceTick += 1 }
        }
        .onReceive(NotificationCenter.default.publisher(for: .ftTrackingStatsChanged)) { _ in
            localDistanceTick += 1
        }
        .sheet(item: $route) { mode in
            FaceCaptureView(mode: mode) { payload, image, mode in
                Task { await handleFace(payload: payload, image: image, mode: mode) }
            }
        }
        .sheet(isPresented: $mapOpen) { MapRouteView() }
        .sheet(isPresented: $leaveOpen) { LeaveView() }
        .sheet(isPresented: $printsOpen) { FootprintsView() }
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            AapBrandMark(height: 46)
            VStack(alignment: .leading, spacing: 2) {
                Text(user?.string("name") ?? (loading ? LocaleStore.t("Loading…", "ਲੋਡ ਹੋ ਰਿਹਾ…") : "Field member"))
                    .font(.title3.weight(.bold)).foregroundColor(AapTheme.textPrimary).lineLimit(1)
                Text([user?.string("sectorAllotted"), user?.string("assemblyName")].compactMap { $0 }.joined(separator: " · ").ifEmpty(SessionStore.phone))
                    .font(.footnote).foregroundColor(AapTheme.textMuted).lineLimit(1)
            }
            Spacer(minLength: 8)
            Button {
                LocaleStore.toggle()
                langTick += 1
            } label: {
                Image(systemName: "globe")
                    .font(.body.weight(.semibold))
                    .foregroundColor(AapTheme.textPrimary)
                    .frame(width: 40, height: 40)
                    .background(AapTheme.navyCard.opacity(0.9))
                    .clipShape(Circle())
            }
            Button { Task { await reload() } } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.body.weight(.semibold))
                    .foregroundColor(AapTheme.textPrimary)
                    .frame(width: 40, height: 40)
                    .background(AapTheme.navyCard.opacity(0.9))
                    .clipShape(Circle())
            }
        }
    }

    private var statusPill: some View {
        HStack(spacing: 8) {
            Circle().fill(punchedIn ? AapTheme.success : AapTheme.textMuted).frame(width: 8, height: 8)
            Text(punchedIn
                 ? LocaleStore.t("On duty — tracking active", "ਡਿਊਟੀ ਚਾਲੂ — ਟ੍ਰੈਕਿੰਗ ਐਕਟਿਵ")
                 : LocaleStore.t("Not punched in", "ਪੰਚ ਇਨ ਨਹੀਂ"))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(punchedIn ? AapTheme.success : AapTheme.textMuted)
            Spacer()
            if punchedIn {
                Text(AapFormat.prettyDuration(from: open?.string("punchInAt"), to: nil))
                    .font(.caption.weight(.bold))
                    .foregroundColor(AapTheme.yellow)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill((punchedIn ? AapTheme.success : AapTheme.textMuted).opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke((punchedIn ? AapTheme.success : AapTheme.textMuted).opacity(0.22), lineWidth: 1)
                )
        )
    }

    private var statsHero: some View {
        HStack(spacing: 0) {
            statBlock(
                LocaleStore.t("Today distance", "ਅੱਜ ਦੀ ਦੂਰੀ"),
                AapFormat.prettyDistance(displayDistance),
                "figure.walk"
            )
            Rectangle()
                .fill(AapTheme.textMuted.opacity(0.25))
                .frame(width: 1, height: 54)
            statBlock(
                LocaleStore.t("Hours worked", "ਕੰਮ ਦੇ ਘੰਟੇ"),
                String(format: "%.1f h", displayHours),
                "clock"
            )
        }
        .padding(.vertical, 18)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(AapTheme.navyCard.opacity(0.92))
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(AapTheme.yellow.opacity(0.18), lineWidth: 1)
                )
        )
    }

    private var registerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(LocaleStore.t("Register your face", "ਆਪਣਾ ਚਿਹਰਾ ਰਜਿਸਟਰ ਕਰੋ"))
                .font(.title3.weight(.semibold)).foregroundColor(AapTheme.textPrimary)
            Text(LocaleStore.t("One-time setup. You need this before your first punch in.", "ਇੱਕ ਵਾਰੀ ਸੈਟਅੱਪ। ਪਹਿਲੇ ਪੰਚ ਤੋਂ ਪਹਿਲਾਂ ਲੋੜੀਂਦਾ।"))
                .font(.subheadline).foregroundColor(AapTheme.textMuted)
            Button {
                route = .register
            } label: {
                Text(LocaleStore.t("Register face", "ਚਿਹਰਾ ਰਜਿਸਟਰ ਕਰੋ"))
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .background(AapTheme.blue).foregroundColor(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .disabled(busy)
        }
        .padding(18)
        .background(AapTheme.navyCard.opacity(0.9))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var punchButton: some View {
        Button(action: requestPunch) {
            HStack(spacing: 14) {
                if busy {
                    ProgressView().tint(punchedIn ? .white : AapTheme.navy)
                } else {
                    Image(systemName: punchedIn ? "rectangle.portrait.and.arrow.right" : "arrow.right.square.fill")
                        .font(.title2.weight(.bold))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(punchedIn
                             ? LocaleStore.t("PUNCH OUT", "ਪੰਚ ਆਉਟ")
                             : LocaleStore.t("PUNCH IN", "ਪੰਚ ਇਨ"))
                            .font(.title2.weight(.black))
                        Text(LocaleStore.t("Face + GPS verified", "ਚਿਹਰਾ + GPS ਪ੍ਰਮਾਣਿਤ"))
                            .font(.caption.weight(.medium))
                            .opacity(0.85)
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, 22)
            .frame(maxWidth: .infinity).frame(height: 92)
            .background(
                LinearGradient(
                    colors: punchedIn
                        ? [AapTheme.blue, AapTheme.blueSoft]
                        : [AapTheme.yellow, AapTheme.yellowDim],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .foregroundColor(punchedIn ? .white : AapTheme.navy)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .shadow(color: (punchedIn ? AapTheme.blue : AapTheme.yellow).opacity(0.35), radius: 16, y: 8)
        }
        .disabled(busy)
    }

    private func statBlock(_ label: String, _ value: String, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.caption).foregroundColor(AapTheme.yellow)
                Text(label).font(.caption.weight(.medium)).foregroundColor(AapTheme.textMuted)
            }
            Text(value)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(AapTheme.yellow)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
    }

    private func action(_ title: String, _ sub: String, _ icon: String, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(
                            LinearGradient(colors: [AapTheme.yellow, AapTheme.yellowDim], startPoint: .topLeading, endPoint: .bottomTrailing)
                        )
                    Image(systemName: icon).font(.body.weight(.semibold)).foregroundColor(AapTheme.navy)
                }
                .frame(width: 40, height: 40)
                Text(title).font(.subheadline.weight(.bold)).foregroundColor(AapTheme.textPrimary).lineLimit(1)
                Text(sub).font(.caption).foregroundColor(AapTheme.textMuted).lineLimit(2)
            }
            .padding(14)
            .frame(maxWidth: .infinity, minHeight: 118, alignment: .leading)
            .background(AapTheme.navyCard.opacity(0.88))
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(Color.white.opacity(0.06), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func say(_ text: String, error: Bool = false) {
        message = text
        isError = error
    }

    private func reload() async {
        do {
            let me = try await ApiClient.getMe()
            guard let u = me.obj("user") else {
                LocationTracker.shared.stop()
                SessionStore.clearAll()
                onLoggedOut()
                return
            }
            user = u
            let att = try await ApiClient.getAttendance()
            open = att.obj("open")
            todayDistance = (att["todayDistanceMeters"] as? NSNumber)?.doubleValue ?? 0
            todayHours = (att["todayHoursWorked"] as? NSNumber)?.doubleValue ?? 0
            priorClosedMs = (att["todayPriorClosedMs"] as? NSNumber)?.doubleValue ?? 0
            openDistance = (open?["distanceMeters"] as? NSNumber)?.doubleValue ?? 0
            if punchedIn, let pin = open?.string("punchInAt") {
                LocationTracker.shared.start(apiBase: SessionStore.apiBase, token: SessionStore.token, punchInAt: pin)
                LocationTracker.shared.syncServerDistance(openDistance)
            }
            nowTick = Date()
            localDistanceTick += 1
            try? await ApiClient.reportLocationPermission(
                foreground: gps.fix.hasWhenInUse,
                background: gps.fix.hasAlways
            )
        } catch {
            say(error.localizedDescription, error: true)
        }
        loading = false
    }

    private func requestPunch() {
        Task {
            busy = true
            say("Getting GPS…")
            do {
                if !punchedIn && !PunchInWindow.isAllowed() {
                    say(PunchInWindow.blockedMessage, error: true)
                    busy = false
                    return
                }
                gps.fix.requestWhenInUse()
                if gps.fix.hasWhenInUse && !gps.fix.hasAlways {
                    gps.fix.requestAlways()
                }
                let loc = try await gps.fix.current()
                try SecurityHelper.assertSecureForPunch(lastLocation: loc)
                lastPunchLoc = loc
                gpsText = String(format: "GPS %.5f, %.5f  ±%.0fm", loc.coordinate.latitude, loc.coordinate.longitude, loc.horizontalAccuracy)
                say("")
                route = punchedIn ? .punchOut : .punchIn
            } catch {
                say(friendlyLocationError(error), error: true)
            }
            busy = false
        }
    }

    private func handleFace(payload: [String: Any], image: String, mode: FaceMode) async {
        let descriptor = payload.doubles("descriptor")
        var samplesNested = payload.nestedDoubles("samples")
        if samplesNested.isEmpty { samplesNested = [descriptor] }
        busy = true
        do {
            switch mode {
            case .register:
                say("Saving face…")
                _ = try await ApiClient.registerFace(descriptor: descriptor, samples: samplesNested, image: image)
                say("Face registered.")
            case .punchIn, .punchOut:
                let punchIn = mode == .punchIn
                if punchIn && !PunchInWindow.isAllowed() {
                    say(PunchInWindow.blockedMessage, error: true)
                    busy = false
                    return
                }
                say(punchIn ? "Punching in…" : "Punching out…")
                let loc: CLLocation
                if let cached = lastPunchLoc, Date().timeIntervalSince(cached.timestamp) < 90 {
                    loc = cached
                } else {
                    loc = try await gps.fix.current()
                    lastPunchLoc = loc
                }
                try SecurityHelper.assertSecureForPunch(lastLocation: loc)
                if punchIn {
                    let res = try await ApiClient.punchIn(
                        lat: loc.coordinate.latitude,
                        lng: loc.coordinate.longitude,
                        accuracy: loc.horizontalAccuracy,
                        descriptor: descriptor,
                        image: image,
                        vpnActive: SecurityHelper.isVpnActive(),
                        isMock: SecurityHelper.isMockLocation(loc)
                    )
                    let punchInAt = res.obj("attendance")?.string("punchInAt") ?? ""
                    if !punchInAt.isEmpty {
                        LocationTracker.shared.start(apiBase: SessionStore.apiBase, token: SessionStore.token, punchInAt: punchInAt)
                        gps.fix.requestAlways()
                    }
                    say("Punched in. Route tracking is on.")
                } else {
                    _ = try await ApiClient.punchOut(
                        lat: loc.coordinate.latitude,
                        lng: loc.coordinate.longitude,
                        accuracy: loc.horizontalAccuracy,
                        descriptor: descriptor,
                        image: image,
                        vpnActive: SecurityHelper.isVpnActive(),
                        isMock: SecurityHelper.isMockLocation(loc)
                    )
                    LocationTracker.shared.stop()
                    say("Punched out.")
                }
            case .check:
                break
            }
            await reload()
        } catch {
            say(friendlyLocationError(error), error: true)
        }
        busy = false
    }

    private func friendlyLocationError(_ error: Error) -> String {
        if let loc = error as? LocationFixError {
            return loc.localizedDescription
        }
        if let cl = error as? CLError, cl.code == .denied {
            return LocationFixError.denied.localizedDescription
        }
        let msg = error.localizedDescription
        if msg.contains("kCLErrorDomain") || msg.contains("error 1") {
            return LocationFixError.denied.localizedDescription
        }
        return msg
    }
}

final class LocationFixHolder: ObservableObject {
    let fix = LocationFix()
}

extension FaceMode: Identifiable { var id: String { rawValue } }

extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
