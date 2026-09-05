import SwiftUI

@main
struct AAPAttendanceApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @State private var loggedIn = !SessionStore.token.isEmpty

    var body: some View {
        ZStack {
            AapTheme.navyDeep.ignoresSafeArea()
            if loggedIn {
                HomeView(onLoggedOut: { loggedIn = false })
            } else {
                LoginView(onLoggedIn: { loggedIn = true })
            }
        }
    }
}
