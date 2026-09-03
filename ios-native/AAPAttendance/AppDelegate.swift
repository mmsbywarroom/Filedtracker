import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.backgroundColor = UIColor(red: 10 / 255, green: 22 / 255, blue: 40 / 255, alpha: 1)
        window.rootViewController = WebShellViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        if !SessionStore.punchInAt.isEmpty {
            LocationTracker.shared.start(
                apiBase: SessionStore.apiBase,
                token: SessionStore.token,
                punchInAt: SessionStore.punchInAt
            )
        }
    }
}
