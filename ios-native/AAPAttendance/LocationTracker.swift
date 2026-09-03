import CoreLocation
import Foundation
import UIKit

final class LocationTracker: NSObject, CLLocationManagerDelegate {
    static let shared = LocationTracker()

    private let manager = CLLocationManager()
    private var lastHeartbeat: TimeInterval = 0
    private(set) var lastLocation: CLLocation?

    /// Attendance FLAG: every 30 minutes from punch-in until punch-out.
    private let flagIntervalSec: TimeInterval = 30 * 60
    /// VPN/security log: at most once per hour.
    private let securityIntervalSec: TimeInterval = 60 * 60
    private let heartbeatSec: TimeInterval = 120
    private let maxFlagSlots = 24

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        manager.distanceFilter = 40
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
        SessionStore.save(token: token, apiBase: apiBase, phone: SessionStore.phone)
        SessionStore.punchInAt = punchInAt
        requestPermissions()
        manager.startUpdatingLocation()
        manager.startMonitoringSignificantLocationChanges()
    }

    func stop() {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
        SessionStore.clearTracking()
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

        if SecurityHelper.isMockLocation(loc) {
            TrackingApi.postSecurityEvent(
                type: "mock_gps",
                action: "blocked",
                detail: "Fake GPS / simulated location",
                lat: loc.coordinate.latitude,
                lng: loc.coordinate.longitude
            )
            TrackingApi.postGpsOff(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude)
            stop()
            return
        }

        let now = Date().timeIntervalSince1970
        if now - lastHeartbeat >= heartbeatSec {
            lastHeartbeat = now
            TrackingApi.postTrack(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude, accuracy: loc.horizontalAccuracy)
        }

        maybeHourlySecurity(loc)
        maybeHalfHourSnapshot(loc)
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
        // Same window as server: early 2 min … late 15 min
        guard now >= due - 120, now <= due + 15 * 60 else { return }
        TrackingApi.postIntervalSnapshot(slot: slot, lat: loc.coordinate.latitude, lng: loc.coordinate.longitude) { ok in
            if ok { SessionStore.markSlotSent(slot) }
        }
    }
}
