import Foundation

enum AppConfig {
    /// Canonical TLS name (Let's Encrypt cert).
    static let apiHost = "filed.videh.co.in"
    /// Elastic IP — bypasses stale DNS during EC2 IP migration.
    static let apiBase = "https://13.234.95.134"
    static let userAgentSuffix = " AAPNative/1"
}

/// Accepts the filed.videh.co.in certificate when talking to the Elastic IP.
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
        cfg.timeoutIntervalForRequest = 55
        cfg.timeoutIntervalForResource = 90
        return URLSession(configuration: cfg, delegate: delegate, delegateQueue: nil)
    }()
}
