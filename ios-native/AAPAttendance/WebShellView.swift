import SwiftUI
import UIKit

extension Notification.Name {
    static let ftLoggedOut = Notification.Name("ftLoggedOut")
}

/// Embeds the production web dashboard (client-side face-api punch — fast like browser).
struct WebShellView: UIViewControllerRepresentable {
    var onLoggedOut: () -> Void

    func makeUIViewController(context: Context) -> WebShellViewController {
        _ = context.coordinator
        return WebShellViewController()
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
