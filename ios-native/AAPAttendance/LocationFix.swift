import CoreLocation
import Foundation

enum LocationFixError: LocalizedError {
    case denied
    case timedOut
    case unavailable

    var errorDescription: String? {
        switch self {
        case .denied:
            return "Location is off. Open Settings → AAP Attendance → Location → While Using the App."
        case .timedOut:
            return "Could not get GPS. Move outdoors and try again."
        case .unavailable:
            return "Location unavailable. Check GPS and try again."
        }
    }
}

final class LocationFix: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var continuation: CheckedContinuation<CLLocation, Error>?
    private var authContinuation: CheckedContinuation<Void, Error>?
    private var locationTimeout: DispatchWorkItem?

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

    var isDenied: Bool {
        let s = manager.authorizationStatus
        return s == .denied || s == .restricted
    }

    func current() async throws -> CLLocation {
        if isDenied {
            throw LocationFixError.denied
        }

        if manager.authorizationStatus == .notDetermined {
            requestWhenInUse()
            try await waitForAuthorization(seconds: 25)
            if isDenied { throw LocationFixError.denied }
            if !hasWhenInUse { throw LocationFixError.unavailable }
        }

        if let last = manager.location, Date().timeIntervalSince(last.timestamp) < 30, last.horizontalAccuracy > 0 {
            return last
        }

        return try await withCheckedThrowingContinuation { cont in
            // Never leave a previous waiter hanging (causes infinite "Punching in…").
            if let prev = continuation {
                prev.resume(throwing: CancellationError())
            }
            continuation = cont
            locationTimeout?.cancel()
            let work = DispatchWorkItem { [weak self] in
                guard let self, let pending = self.continuation else { return }
                self.continuation = nil
                pending.resume(throwing: LocationFixError.timedOut)
            }
            locationTimeout = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: work)
            manager.requestLocation()
        }
    }

    private func waitForAuthorization(seconds: TimeInterval) async throws {
        if hasWhenInUse || isDenied { return }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            if let prev = authContinuation {
                prev.resume(throwing: CancellationError())
            }
            authContinuation = cont
            DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
                guard let self, let pending = self.authContinuation else { return }
                self.authContinuation = nil
                pending.resume(throwing: LocationFixError.timedOut)
            }
        }
    }

    private func finishLocation(_ result: Result<CLLocation, Error>) {
        locationTimeout?.cancel()
        locationTimeout = nil
        guard let cont = continuation else { return }
        continuation = nil
        switch result {
        case .success(let loc): cont.resume(returning: loc)
        case .failure(let err): cont.resume(throwing: err)
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if let auth = authContinuation {
            if hasWhenInUse || isDenied {
                authContinuation = nil
                if isDenied {
                    auth.resume(throwing: LocationFixError.denied)
                } else {
                    auth.resume()
                }
            }
        }
        if hasWhenInUse, continuation != nil {
            manager.requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        finishLocation(.success(loc))
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let mapped: Error
        if let cl = error as? CLError, cl.code == .denied {
            mapped = LocationFixError.denied
        } else {
            mapped = error
        }
        finishLocation(.failure(mapped))
    }
}
