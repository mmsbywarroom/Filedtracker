import CoreLocation
import Foundation

final class LocationFix: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestWhenInUse() {
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
    }

    func requestAlways() {
        manager.requestAlwaysAuthorization()
    }

    var hasWhenInUse: Bool {
        let s = manager.authorizationStatus
        return s == .authorizedWhenInUse || s == .authorizedAlways
    }

    var hasAlways: Bool {
        manager.authorizationStatus == .authorizedAlways
    }

    func current() async throws -> CLLocation {
        requestWhenInUse()
        if let last = manager.location, Date().timeIntervalSince(last.timestamp) < 20 {
            return last
        }
        return try await withCheckedThrowingContinuation { cont in
            continuation = cont
            manager.requestLocation()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if hasWhenInUse, continuation != nil {
            manager.requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        continuation?.resume(returning: loc)
        continuation = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}
