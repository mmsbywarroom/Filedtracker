import SwiftUI
import UIKit

extension Notification.Name {
    static let ftLoggedOut = Notification.Name("ftLoggedOut")
}

/// Embeds the production web dashboard (or rally check-in) in a WebView.
struct WebShellView: UIViewControllerRepresentable {
    var initialPath: String = "/dashboard"
    var onLoggedOut: () -> Void

    func makeUIViewController(context: Context) -> WebShellViewController {
        _ = context.coordinator
        return WebShellViewController(initialPath: initialPath)
    }

    func updateUIViewController(_ uiViewController: WebShellViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onLoggedOut: onLoggedOut)
    }

    final class Coordinator {
        let onLoggedOut: () -> Void
        private var observer: NSObjectProtocol?

        init(onLoggedOut: @escaping () -> Void) {
            self.onLoggedOut = onLoggedOut
            observer = NotificationCenter.default.addObserver(
                forName: .ftLoggedOut,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.onLoggedOut()
            }
        }

        deinit {
            if let observer {
                NotificationCenter.default.removeObserver(observer)
            }
        }
    }
}
