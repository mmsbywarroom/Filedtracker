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

    private var faceRegistered: Bool { user?.string("faceRegisteredAt") != nil }
    private var punchedIn: Bool { open != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                statusPill
                AapCard {
                    HStack {
                        stat(LocaleStore.t("Today distance", "ਅੱਜ ਦੀ ਦੂਰੀ"), AapFormat.prettyDistance(todayDistance))
                        stat(LocaleStore.t("Hours worked", "ਕੰਮ ਦੇ ਘੰਟੇ"), String(format: "%.1f h", todayHours))
                    }
                    if punchedIn {
                        Text("Since \(AapFormat.prettyTime(open?.string("punchInAt"))) · \(AapFormat.prettyDuration(from: open?.string("punchInAt"), to: nil))")
                            .font(.subheadline)
                            .foregroundColor(AapTheme.textMuted)
                            .padding(.top, 8)
                    }
                }
                if !loading && !faceRegistered {
                    AapCard {
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
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        .disabled(busy)
                        .padding(.top, 8)
                    }
                }
                if loading {
                    ProgressView().tint(AapTheme.yellow).frame(maxWidth: .infinity).padding(40)
                } else if faceRegistered || punchedIn {
                    Button(action: requestPunch) {
                        HStack(spacing: 14) {
                            if busy {
                                ProgressView().tint(punchedIn ? .white : AapTheme.navy)
                            } else {
                                Image(systemName: punchedIn ? "rectangle.portrait.and.arrow.right" : "arrow.right.square")
                                    .font(.title)
                                VStack(alignment: .leading) {
                                    Text(punchedIn
                                         ? LocaleStore.t("PUNCH OUT", "ਪੰਚ ਆਉਟ")
                                         : LocaleStore.t("PUNCH IN", "ਪੰਚ ਇਨ"))
                                        .font(.title2.weight(.black))
                                    Text(LocaleStore.t("Face + GPS verified", "ਚਿਹਰਾ + GPS ਪ੍ਰਮਾਣਿਤ"))
                                        .font(.caption)
                                }
                            }
                        }
                        .frame(maxWidth: .infinity).frame(height: 96)
                        .background(punchedIn ? AapTheme.blue : AapTheme.yellow)
                        .foregroundColor(punchedIn ? .white : AapTheme.navy)
                        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    }
                    .disabled(busy)
                }
                if !gpsText.isEmpty {
                    Text(gpsText).font(.caption).foregroundColor(AapTheme.textMuted)
                }
                if !message.isEmpty {
                    Text(message).font(.subheadline).foregroundColor(isError ? AapTheme.danger : AapTheme.success)
                }
                Text(LocaleStore.t("QUICK ACTIONS", "ਤੇਜ਼ ਕਾਰਵਾਈਆਂ"))
                    .font(.caption).foregroundColor(AapTheme.textMuted).tracking(2)
                    .padding(.top, 8)
                HStack(spacing: 14) {
                    action(LocaleStore.t("Live map", "ਲਾਈਵ ਨਕਸ਼ਾ"), LocaleStore.t("Your route today", "ਅੱਜ ਦਾ ਰਸਤਾ"), "map") { mapOpen = true }
                    action(LocaleStore.t("Footprints", "ਰਸਤੇ"), LocaleStore.t("Past sessions", "ਪਿਛਲੀਆਂ ਸੈਸ਼ਨ"), "point.topleft.down.curvedto.point.bottomright.up") { printsOpen = true }
                }
                HStack(spacing: 14) {
                    action(LocaleStore.t("Leave", "ਛੁੱਟੀ"), LocaleStore.t("Apply & track", "ਬੇਨਤੀ ਤੇ ਸਥਿਤੀ"), "calendar") { leaveOpen = true }
                    action(LocaleStore.t("Face check", "ਚਿਹਰਾ ਜਾਂਚ"), LocaleStore.t("Camera self-test", "ਕੈਮਰਾ ਟੈਸਟ"), "faceid") { route = .check }
                }
                Button {
                    LocationTracker.shared.stop()
                    SessionStore.clearAll()
                    onLoggedOut()
                } label: {
                    Label(LocaleStore.t("Logout", "ਲਾਗਆਉਟ"), systemImage: "rectangle.portrait.and.arrow.right")
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .foregroundColor(AapTheme.textMuted)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(AapTheme.textMuted.opacity(0.3)))
                }
                .padding(.bottom, 28)
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
        }
        .id(langTick)
        .background(AapTheme.navyDeep.ignoresSafeArea())
        .task { await reload() }
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
        HStack {
            AapBrandMark(height: 44)
            VStack(alignment: .leading) {
                Text(user?.string("name") ?? (loading ? LocaleStore.t("Loading…", "ਲੋਡ ਹੋ ਰਿਹਾ…") : "Field member"))
                    .font(.title3.weight(.semibold)).foregroundColor(AapTheme.textPrimary).lineLimit(1)
                Text([user?.string("sectorAllotted"), user?.string("assemblyName")].compactMap { $0 }.joined(separator: " · ").ifEmpty(SessionStore.phone))
                    .font(.subheadline).foregroundColor(AapTheme.textMuted).lineLimit(1)
            }
            Spacer()
            Button {
                LocaleStore.toggle()
                langTick += 1
            } label: { Image(systemName: "globe").foregroundColor(AapTheme.textMuted) }
            Button { Task { await reload() } } label: { Image(systemName: "arrow.clockwise").foregroundColor(AapTheme.textMuted) }
        }
    }

    private var statusPill: some View {
        HStack(spacing: 9) {
            Circle().fill(punchedIn ? AapTheme.success : AapTheme.textMuted).frame(width: 9, height: 9)
            Text(punchedIn
                 ? LocaleStore.t("Punched in — route tracking active", "ਪੰਚ ਇਨ — ਰਸਤਾ ਟਰੈਕ ਹੋ ਰਿਹਾ")
                 : LocaleStore.t("Not punched in", "ਪੰਚ ਇਨ ਨਹੀਂ"))
                .font(.subheadline.weight(.semibold))
                .foregroundColor(punchedIn ? AapTheme.success : AapTheme.textMuted)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background((punchedIn ? AapTheme.success : AapTheme.textMuted).opacity(0.14))
        .clipShape(Capsule())
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading) {
            Text(label).font(.caption).foregroundColor(AapTheme.textMuted)
            Text(value).font(.title3.weight(.semibold)).foregroundColor(AapTheme.yellow)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func action(_ title: String, _ sub: String, _ icon: String, tap: @escaping () -> Void) -> some View {
        Button(action: tap) {
            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 14).fill(AapTheme.yellow)
                    Image(systemName: icon).foregroundColor(AapTheme.navy)
                }
                .frame(width: 42, height: 42)
                Text(title).font(.headline).foregroundColor(AapTheme.textPrimary)
                Text(sub).font(.subheadline).foregroundColor(AapTheme.textMuted)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AapTheme.navyCard.opacity(0.85))
            .clipShape(RoundedRectangle(cornerRadius: 24))
        }
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
            if punchedIn, let pin = open?.string("punchInAt") {
                LocationTracker.shared.start(apiBase: SessionStore.apiBase, token: SessionStore.token, punchInAt: pin)
            }
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
                gps.fix.requestWhenInUse()
                if gps.fix.hasWhenInUse && !gps.fix.hasAlways {
                    gps.fix.requestAlways()
                }
                let loc = try await gps.fix.current()
                if SecurityHelper.isMockLocation(loc) {
                    TrackingApi.postSecurityEvent(type: "mock_gps", action: "detected", detail: "Fake GPS", lat: loc.coordinate.latitude, lng: loc.coordinate.longitude)
                }
                gpsText = String(format: "GPS %.5f, %.5f  ±%.0fm", loc.coordinate.latitude, loc.coordinate.longitude, loc.horizontalAccuracy)
                say("")
                route = punchedIn ? .punchOut : .punchIn
            } catch {
                say(error.localizedDescription, error: true)
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
                say(punchIn ? "Punching in…" : "Punching out…")
                let loc = try await gps.fix.current()
                if punchIn {
                    let res = try await ApiClient.punchIn(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude, accuracy: loc.horizontalAccuracy, descriptor: descriptor, image: image)
                    let punchInAt = res.obj("attendance")?.string("punchInAt") ?? ""
                    if !punchInAt.isEmpty {
                        LocationTracker.shared.start(apiBase: SessionStore.apiBase, token: SessionStore.token, punchInAt: punchInAt)
                        gps.fix.requestAlways()
                    }
                    say("Punched in. Route tracking is on.")
                } else {
                    _ = try await ApiClient.punchOut(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude, accuracy: loc.horizontalAccuracy, descriptor: descriptor, image: image)
                    LocationTracker.shared.stop()
                    say("Punched out.")
                }
            case .check:
                break
            }
            await reload()
        } catch {
            say(error.localizedDescription, error: true)
        }
        busy = false
    }
}

final class LocationFixHolder: ObservableObject {
    let fix = LocationFix()
}

extension FaceMode: Identifiable { var id: String { rawValue } }

extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
