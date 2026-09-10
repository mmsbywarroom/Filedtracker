import CoreLocation
import Foundation
import UIKit

final class LocationTracker: NSObject, CLLocationManagerDelegate {
    static let shared = LocationTracker()

    private let manager = CLLocationManager()
    private var lastHeartbeat: TimeInterval = 0
    private var lastTrackPost: TimeInterval = 0
    private var lastCredited: CLLocation?
    private var lastPosted: CLLocation?
    private(set) var lastLocation: CLLocation?
    /// Local session travel since punch-in (meters); UI uses max(server, this).
    private(set) var localTravelMeters: Double = 0

    private let flagIntervalSec: TimeInterval = 30 * 60
    private let securityIntervalSec: TimeInterval = 60 * 60
    private let heartbeatSec: TimeInterval = 60
    private let minTrackPostSec: TimeInterval = 20
    private let creditMinMeters: CLLocationDistance = 35
    private let maxFlagSlots = 24

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 25
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
    }

    func permissionStatusJSON() -> String {
        let status = manager.authorizationStatus
        let fg = status == .authorizedAlways || status == .authorizedWhenInUse
        let bg = status == .authorizedAlways
        let needsSettings = status == .authorizedWhenInUse
        return "{\"foreground\":\(fg),\"background\":\(bg),\"needsSettings\":\(needsSettings)}"
    }

    func requestPermissions() {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        } else if status == .authorizedWhenInUse {
            manager.requestAlwaysAuthorization()
        }
    }

    func start(apiBase: String, token: String, punchInAt: String) {
        let sameSession = !punchInAt.isEmpty && SessionStore.punchInAt == punchInAt
        SessionStore.save(token: token, apiBase: apiBase, phone: SessionStore.phone)
        SessionStore.punchInAt = punchInAt
        if !sameSession {
            localTravelMeters = 0
            lastCredited = nil
            lastPosted = nil
            lastTrackPost = 0
            lastHeartbeat = 0
        }
        requestPermissions()
        manager.startUpdatingLocation()
        manager.startMonitoringSignificantLocationChanges()
    }

    /// Keep local total at least as high as last server-reported open-session distance.
    func syncServerDistance(_ meters: Double) {
        if meters > localTravelMeters { localTravelMeters = meters }
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        SessionStore.clearTracking()
        localTravelMeters = 0
        lastCredited = nil
        lastPosted = nil
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse {
            manager.requestAlwaysAuthorization()
        }
        if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse {
            if !SessionStore.punchInAt.isEmpty {
                manager.startUpdatingLocation()
            }
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        lastLocation = loc
        guard !SessionStore.token.isEmpty, !SessionStore.punchInAt.isEmpty else { return }

        if SecurityHelper.shouldAutoPunchOutForSecurity(lastLocation: loc) {
            let reason = SecurityHelper.autoPunchOutReason(lastLocation: loc)
            TrackingApi.postSecurityEvent(
                type: reason == "vpn" ? "vpn" : "mock_gps",
                action: "auto_punch_out",
                detail: reason == "vpn"
                    ? "Auto punch-out: VPN detected after punch-in"
                    : "Auto punch-out: Fake GPS (mock location) detected after punch-in",
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude
            )
            TrackingApi.postSecurityPunchOut(
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude,
                reason: reason
            )
            stop()
            return
        }

        creditLocalTravel(loc)

        let now = Date().timeIntervalSince1970
        let shouldPostTrack: Bool = {
            if lastPosted == nil { return true }
            guard let prev = lastPosted else { return true }
            return loc.distance(from: prev) >= creditMinMeters && now - lastTrackPost >= minTrackPostSec
        }()
        if shouldPostTrack {
            lastTrackPost = now
            lastHeartbeat = now
            lastPosted = loc
            TrackingApi.postTrack(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude, accuracy: loc.horizontalAccuracy)
        } else if now - lastHeartbeat >= heartbeatSec {
            lastHeartbeat = now
            TrackingApi.postHeartbeat(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude)
        }

        maybeHourlySecurity(loc)
        maybeHalfHourSnapshot(loc)
    }

    private func creditLocalTravel(_ loc: CLLocation) {
        guard loc.horizontalAccuracy >= 0, loc.horizontalAccuracy <= 65 else { return }
        if let prev = lastCredited {
            let gap = loc.distance(from: prev)
            let dt = loc.timestamp.timeIntervalSince(prev.timestamp)
            if gap >= creditMinMeters, dt > 0, gap / max(dt, 1) <= 35 {
                localTravelMeters += gap
                lastCredited = loc
                NotificationCenter.default.post(name: .ftTrackingStatsChanged, object: nil)
            }
        } else {
            lastCredited = loc
        }
    }

    private func maybeHourlySecurity(_ loc: CLLocation) {
        let now = Date().timeIntervalSince1970
        if now - SessionStore.lastHourlySecurityAt < securityIntervalSec { return }
        SessionStore.lastHourlySecurityAt = now
        if SecurityHelper.isVpnActive() {
            TrackingApi.postSecurityEvent(
                type: "vpn",
                action: "detected",
                detail: "VPN connected on device",
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude
            )
        }
    }

    private func maybeHalfHourSnapshot(_ loc: CLLocation) {
        let punch = SessionStore.punchInMs
        guard punch > 0 else { return }
        let elapsed = Date().timeIntervalSince1970 - punch
        let slot = Int(floor(elapsed / flagIntervalSec))
        guard slot >= 1, slot <= maxFlagSlots else { return }
        guard !SessionStore.hasSentSlot(slot) else { return }
        let due = punch + Double(slot) * flagIntervalSec
        let now = Date().timeIntervalSince1970
        guard now >= due - 120, now <= due + 25 * 60 else { return }
        TrackingApi.postIntervalSnapshot(slot: slot, lat: loc.coordinate.latitude, lng: loc.coordinate.longitude) { ok in
            if ok { SessionStore.markSlotSent(slot) }
        }
    }
}

extension Notification.Name {
    static let ftTrackingStatsChanged = Notification.Name("ftTrackingStatsChanged")
}
