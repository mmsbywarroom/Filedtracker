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
    @State private var isRally = SessionStore.isRallyUser

    var body: some View {
        ZStack {
            AapTheme.navyDeep.ignoresSafeArea()
            if loggedIn {
                if isRally {
                    WebShellView(initialPath: "/rally", onLoggedOut: {
                        loggedIn = false
                        isRally = false
                    })
                } else {
                    HomeView(onLoggedOut: {
                        loggedIn = false
                        isRally = false
                    })
                }
            } else {
                LoginView(onLoggedIn: { kind in
                    isRally = kind.lowercased() == "rally"
                    loggedIn = true
                })
            }
        }
    }
}
