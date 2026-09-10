import UIKit
import WebKit

final class WebShellViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var webView: WKWebView!
    private let apiBase = SessionStore.apiBase

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10 / 255, green: 22 / 255, blue: 40 / 255, alpha: 1)

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        config.applicationNameForUserAgent = "AAPNative/1"

        let controller = config.userContentController
        controller.add(self, name: "NativeApp")
        controller.addUserScript(WKUserScript(source: Self.bridgeJS, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        controller.addUserScript(WKUserScript(source: Self.punchHookJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        LocationTracker.shared.requestPermissions()
        loadApp()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        pushInsets()
    }

    private func loadApp() {
        // Always load the public domain in WebView (TLS + cookie domain).
        let webBase = AppConfig.apiBase
        guard let url = URL(string: webBase + "/dashboard") else { return }
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalCacheData
        setSessionCookie(token: SessionStore.token) {
            self.webView.load(req)
        }
    }

    private func pushInsets() {
        let top = view.safeAreaInsets.top
        let bottom = view.safeAreaInsets.bottom
        let js = """
        document.documentElement.style.setProperty('--status-bar-height','\(Int(top))px');
        document.documentElement.style.setProperty('--navigation-bar-height','\(Int(bottom))px');
        document.body && document.body.classList.add('pure-native-app');
        window.__PURE_NATIVE_APP__=true;
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("window.__PURE_NATIVE_APP__=true;", completionHandler: nil)
        pushInsets()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        switch prompt {
        case "__ft_getSecurityStatus__":
            completionHandler(SecurityHelper.securityStatusJSON(lastLocation: LocationTracker.shared.lastLocation))
        case "__ft_getLocationPermissionStatus__":
            completionHandler(LocationTracker.shared.permissionStatusJSON())
        case "__ft_getStatusBarHeightPx__":
            completionHandler(String(Int(view.safeAreaInsets.top)))
        case "__ft_getNavigationBarHeightPx__":
            completionHandler(String(Int(view.safeAreaInsets.bottom)))
        default:
            completionHandler(defaultText)
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "NativeApp",
              let body = message.body as? [String: Any],
              let cmd = body["cmd"] as? String
        else { return }
        let args = body["args"] as? [String: Any] ?? [:]
        DispatchQueue.main.async { self.handle(cmd: cmd, args: args) }
    }

    private func handle(cmd: String, args: [String: Any]) {
        switch cmd {
        case "saveSession":
            let token = args["token"] as? String ?? ""
            let phone = args["phone"] as? String ?? ""
            SessionStore.save(token: token, apiBase: AppConfig.apiBase, phone: phone)
            setSessionCookie(token: token)
        case "startTracking":
            LocationTracker.shared.start(
                apiBase: args["apiBase"] as? String ?? SessionStore.apiBase,
                token: args["token"] as? String ?? SessionStore.token,
                punchInAt: args["punchInAt"] as? String ?? ""
            )
        case "stopTracking":
            LocationTracker.shared.stop()
        case "reportSecurityEvent":
            TrackingApi.postSecurityEvent(
                type: args["type"] as? String ?? "vpn",
                action: args["action"] as? String ?? "blocked",
                detail: args["detail"] as? String ?? ""
            )
        case "requestLocationPermissions":
            LocationTracker.shared.requestPermissions()
        case "requestCameraPermission":
            break
        case "openLocationSettings":
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        case "clearSessionAndCookies":
            LocationTracker.shared.stop()
            SessionStore.clearAll()
            WKWebsiteDataStore.default().removeData(
                ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                modifiedSince: Date(timeIntervalSince1970: 0)
            ) {
                NotificationCenter.default.post(name: .ftLoggedOut, object: nil)
            }
        case "exitApp":
            UIApplication.shared.perform(NSSelectorFromString("suspend"))
        default:
            break
        }
    }

    private func setSessionCookie(token: String, completion: (() -> Void)? = nil) {
        guard !token.isEmpty else {
            completion?()
            return
        }
        let cookie = HTTPCookie(properties: [
            .domain: AppConfig.apiHost,
            .path: "/",
            .name: "ft_user_session",
            .value: token,
            .secure: "TRUE",
            .expires: Date().addingTimeInterval(60 * 60 * 24 * 14),
        ])
        guard let cookie else {
            completion?()
            return
        }
        HTTPCookieStorage.shared.setCookie(cookie)
        webView.configuration.websiteDataStore.httpCookieStore.setCookie(cookie) {
            DispatchQueue.main.async { completion?() }
        }
    }

    private static let bridgeJS = """
    (function(){
      window.__PURE_NATIVE_APP__=true;
      function send(cmd, args){
        try { window.webkit.messageHandlers.NativeApp.postMessage({cmd:cmd, args:args||{}}); } catch(e) {}
      }
      window.NativeAppBridge = {
        saveSession: function(token, apiBase, phone){ send('saveSession', {token:token, apiBase:apiBase, phone:phone}); },
        startTracking: function(apiBase, token, punchInAt){ send('startTracking', {apiBase:apiBase, token:token, punchInAt:punchInAt}); },
        stopTracking: function(){ send('stopTracking'); },
        getSecurityStatus: function(){ return prompt('__ft_getSecurityStatus__') || '{}'; },
        reportSecurityEvent: function(type, action, detail){ send('reportSecurityEvent', {type:type, action:action, detail:detail}); },
        getLocationPermissionStatus: function(){ return prompt('__ft_getLocationPermissionStatus__') || '{}'; },
        requestLocationPermissions: function(){ send('requestLocationPermissions'); return prompt('__ft_getLocationPermissionStatus__') || '{}'; },
        requestCameraPermission: function(){ send('requestCameraPermission'); },
        getStatusBarHeightPx: function(){ return Number(prompt('__ft_getStatusBarHeightPx__')||'47'); },
        getNavigationBarHeightPx: function(){ return Number(prompt('__ft_getNavigationBarHeightPx__')||'0'); },
        openLocationSettings: function(){ send('openLocationSettings'); },
        clearSessionAndCookies: function(){ send('clearSessionAndCookies'); },
        exitApp: function(){ send('exitApp'); },
        isPureNative: function(){ return true; }
      };
    })();
    """

    private static let punchHookJS = """
    (function(){
      if(window.__ftPunchSecurityHook)return;
      window.__ftPunchSecurityHook=1;
      function ftSecStatus(){
        try{
          if(!window.NativeAppBridge||!NativeAppBridge.getSecurityStatus)return null;
          return JSON.parse(NativeAppBridge.getSecurityStatus()||'{}');
        }catch(e){return null;}
      }
      function ftSecBlockedMessage(s){
        if(!s)return '';
        if(s.spoofApp||s.mockLikely||s.spoofPackage)return 'Punch blocked: Fake GPS / mock location detected. Turn it off completely, then try again.';
        if(s.vpn||s.vpnActive||s.vpnPackage)return 'Punch blocked: VPN detected. Turn off VPN, then try again.';
        return '';
      }
      function ftSecReport(s){
        try{
          if(!s)return;
          var apps=[];
          if(s.vpnPackage)apps.push('VPN app: '+s.vpnPackage+(s.vpnActive?' (connected)':''));
          else if(s.vpn||s.vpnActive)apps.push('VPN connected on device');
          if(s.spoofPackage)apps.push('Fake GPS / spoof app: '+s.spoofPackage);
          else if(s.spoofApp||s.mockLikely)apps.push('Fake GPS / spoof app detected');
          if(!apps.length)return;
          var d='Apps at native punch-in: '+apps.join('; ')+'. Punch blocked.';
          try{NativeAppBridge.reportSecurityEvent('punch_evidence','blocked',d);}catch(e){}
          try{fetch('/api/attendance/security-event',{method:'POST',credentials:'include',keepalive:true,headers:{'Content-Type':'application/json','X-Client-Source':'native'},body:JSON.stringify({type:'punch_evidence',action:'blocked',detail:d})});}catch(e){}
        }catch(e){}
      }
      function mergeSec(bodyText,s){
        try{
          var o=bodyText?JSON.parse(bodyText):{};
          if(!s)return JSON.stringify(o);
          o.vpnActive=!!(s.vpnActive||s.vpn);
          o.vpn=!!(s.vpnActive||s.vpn);
          o.isMock=!!(s.spoofApp||s.mockLikely);
          o.mockLocation=!!(s.spoofApp||s.mockLikely);
          o.spoofApp=!!(s.spoofApp||s.mockLikely);
          return JSON.stringify(o);
        }catch(e){return bodyText;}
      }
      var origFetch=window.fetch;
      window.fetch=function(input,init){
        var url=typeof input==='string'?input:(input&&input.url)||'';
        var method=((init&&init.method)||(typeof input!=='string'&&input&&input.method)||'GET').toUpperCase();
        if(method==='POST'&&/\\/api\\/attendance(\\/punch-out)?(\\?|$)/.test(url)){
          var s=ftSecStatus();
          var blocked=ftSecBlockedMessage(s);
          if(blocked){
            ftSecReport(s);
            return Promise.reject(new Error(blocked));
          }
          init=init?Object.assign({},init):{};
          init.body=mergeSec(init.body,s);
        }
        return origFetch.apply(this,arguments);
      };
    })();
    """
}
