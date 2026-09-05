import Foundation

enum AppConfig {
    static let apiHost = "filed.videh.co.in"
    /// Preferred — same URL as the website.
    static let apiBase = "https://filed.videh.co.in"
    /// Elastic IP backup when DNS/domain fails.
    static let apiBaseFallback = "https://13.234.95.134"
    static let userAgentSuffix = " AAPNative/1"

    static var apiBases: [String] { [apiBase, apiBaseFallback] }
}

final class TrustedHostSessionDelegate: NSObject, URLSessionDelegate {
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust
        else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        let host = challenge.protectionSpace.host
        if host == "13.234.95.134" || host == AppConfig.apiHost {
            completionHandler(.useCredential, URLCredential(trust: trust))
            return
        }
        completionHandler(.performDefaultHandling, nil)
    }
}

enum AppUrlSession {
    private static let delegate = TrustedHostSessionDelegate()
    static let shared: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 25
        cfg.timeoutIntervalForResource = 55
        return URLSession(configuration: cfg, delegate: delegate, delegateQueue: nil)
    }()
}
