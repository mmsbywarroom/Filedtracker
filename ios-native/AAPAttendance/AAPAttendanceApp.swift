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
                // Web dashboard: client-side face match (same speed as website).
                // Native HomeView kept in project for future; punch UX is web again.
                WebShellView(onLoggedOut: { loggedIn = false })
                    .ignoresSafeArea()
            } else {
                LoginView(onLoggedIn: { loggedIn = true })
            }
        }
    }
}
