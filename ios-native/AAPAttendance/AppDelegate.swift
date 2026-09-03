import UIKit

final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        if !SessionStore.punchInAt.isEmpty, !SessionStore.token.isEmpty {
            LocationTracker.shared.start(
                apiBase: SessionStore.apiBase,
                token: SessionStore.token,
                punchInAt: SessionStore.punchInAt
            )
        }
    }
}
