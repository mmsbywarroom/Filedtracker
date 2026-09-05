import SwiftUI
import WebKit

/// On-device face-api via /native-face — same speed as website; no server describeFace.
struct NativeFaceWebView: UIViewControllerRepresentable {
    let mode: FaceMode
    var onCaptured: (_ descriptorJson: String, _ image: String) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> NativeFaceWebViewController {
        let vc = NativeFaceWebViewController(mode: mode)
        vc.onCaptured = onCaptured
        vc.onCancel = onCancel
        return vc
    }

    func updateUIViewController(_ uiViewController: NativeFaceWebViewController, context: Context) {
        uiViewController.onCaptured = onCaptured
        uiViewController.onCancel = onCancel
    }
}

final class NativeFaceWebViewController: UIViewController, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    var onCaptured: ((String, String) -> Void)?
    var onCancel: (() -> Void)?
    private let mode: FaceMode
    private var webView: WKWebView!

    init(mode: FaceMode) {
        self.mode = mode
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 22 / 255, blue: 40 / 255, alpha: 1)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "AAPNative/1"
        config.userContentController.add(self, name: "NativeFace")
        config.userContentController.addUserScript(WKUserScript(source: Self.bridgeJS, injectionTime: .atDocumentStart, forMainFrameOnly: false))

        webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        setCookieThenLoad()
    }

    private func setCookieThenLoad() {
        let token = SessionStore.token
        let host = AppConfig.apiHost
        guard !token.isEmpty else {
            loadPage()
            return
        }
        let cookie = HTTPCookie(properties: [
            .domain: host,
            .path: "/",
            .name: "ft_user_session",
            .value: token,
            .secure: "TRUE",
            .expires: Date().addingTimeInterval(60 * 60 * 24 * 14),
        ])
        if let cookie {
            webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) { [weak self] in
                DispatchQueue.main.async { self?.loadPage() }
            }
        } else {
            loadPage()
        }
    }

    private func loadPage() {
        let faceMode = mode == .register ? "register" : "verify"
        guard let url = URL(string: AppConfig.apiBase + "/native-face?mode=" + faceMode) else { return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "NativeFace",
              let body = message.body as? [String: Any],
              let cmd = body["cmd"] as? String
        else { return }
        DispatchQueue.main.async {
            switch cmd {
            case "captured":
                let descriptor = body["descriptor"] as? String ?? ""
                let image = body["image"] as? String ?? ""
                if !descriptor.isEmpty, !image.isEmpty {
                    self.onCaptured?(descriptor, image)
                } else {
                    self.onCancel?()
                }
            case "cancel", "error":
                self.onCancel?()
            default:
                break
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }

    private static let bridgeJS = """
    (function(){
      function send(cmd, args){
        try { window.webkit.messageHandlers.NativeFace.postMessage(Object.assign({cmd:cmd}, args||{})); } catch(e) {}
      }
      window.NativeFaceBridge = {
        onFaceCaptured: function(descriptorJson, image){ send('captured', {descriptor: descriptorJson, image: image}); },
        onFaceCancel: function(){ send('cancel'); },
        onFaceError: function(msg){ send('error', {message: String(msg||'')}); }
      };
    })();
    """
}
