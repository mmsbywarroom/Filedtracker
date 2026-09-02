declare global {
  interface Window {
    NativeAppBridge?: {
      saveSession(token: string, apiBase: string, phone: string): void;
      startTracking(apiBase: string, token: string, punchInAt: string): void;
      stopTracking(): void;
      getSecurityStatus(): string;
      reportSecurityEvent(type: string, action: string, detail: string): void;
      getLocationPermissionStatus(): string;
      requestLocationPermissions(): string;
      requestCameraPermission(): void;
      getStatusBarHeightPx(): number;
      getNavigationBarHeightPx(): number;
      openLocationSettings(): void;
      clearSessionAndCookies(): void;
      exitApp(): void;
      isPureNative?(): boolean;
    };
    __PURE_NATIVE_APP__?: boolean;
  }
}

/** Pure native Android app (WebView shell). */
export function isPureNativeApp() {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("AAPNative/")) return true;
  return window.__PURE_NATIVE_APP__ === true || !!window.NativeAppBridge;
}

export function pureNativeBridge() {
  if (!isPureNativeApp()) return null;
  return window.NativeAppBridge ?? null;
}

export type NativeSecurityStatus = {
  vpn: boolean;
  vpnActive?: boolean;
  spoofApp: boolean;
  spoofPackage: string;
  vpnPackage?: string;
  mockLikely: boolean;
  detail?: string;
};

export function readNativeSecurityStatus(): NativeSecurityStatus | null {
  const bridge = pureNativeBridge();
  if (!bridge?.getSecurityStatus) return null;
  try {
    const o = JSON.parse(bridge.getSecurityStatus()) as NativeSecurityStatus;
    const vpnPackage = String(o.vpnPackage || "");
    const spoofPackage = String(o.spoofPackage || "");
    return {
      vpn: Boolean(o.vpn) || Boolean(vpnPackage),
      vpnActive: Boolean(o.vpnActive),
      spoofApp: Boolean(o.spoofApp) || Boolean(spoofPackage),
      spoofPackage,
      vpnPackage,
      mockLikely: Boolean(o.mockLikely),
      detail: String(o.detail || ""),
    };
  } catch {
    return null;
  }
}

/** Dual report: native OkHttp + cookie-authenticated web API (admin log). */
function reportSecurityViolation(type: "vpn" | "mock_gps" | "spoof_app", action: string, detail: string) {
  const bridge = pureNativeBridge();
  try {
    bridge?.reportSecurityEvent?.(type, action, detail);
  } catch {
    /* ignore */
  }
  try {
    void fetch("/api/attendance/security-event", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Source": "native",
      },
      body: JSON.stringify({ type, action, detail }),
    });
  } catch {
    /* ignore */
  }
}

/** Block punch when VPN / spoof apps detected; also report to admin. */
export function assertNativeSecureForPunch(): void {
  const bridge = pureNativeBridge();
  if (!bridge) return;
  const status = readNativeSecurityStatus();
  if (!status) return;

  if (status.vpn || status.vpnPackage) {
    const detail =
      status.detail ||
      (status.vpnPackage
        ? `VPN app: ${status.vpnPackage}`
        : status.vpnActive
          ? "VPN connected on device"
          : "VPN detected on punch attempt");
    reportSecurityViolation("vpn", "blocked", detail);
    if (status.vpnActive) {
      throw new Error("Turn off VPN before punch in/out.");
    }
    throw new Error(
      status.vpnPackage
        ? `Remove VPN app from this phone before punch in/out (${status.vpnPackage}).`
        : "Remove VPN app from this phone before punch in/out."
    );
  }
  if (status.spoofApp) {
    const detail = status.spoofPackage
      ? `Spoof / fake GPS app: ${status.spoofPackage}`
      : "Fake GPS / location changer app installed";
    reportSecurityViolation("spoof_app", "blocked", detail);
    throw new Error(
      status.spoofPackage
        ? `Remove fake GPS / spoof apps from this phone (${status.spoofPackage}).`
        : "Remove fake GPS / spoof apps from this phone."
    );
  }
}

export function saveNativeSession(token: string, apiBase: string, phone: string) {
  const bridge = pureNativeBridge();
  if (!bridge?.saveSession || !token) return;
  try {
    bridge.saveSession(token, apiBase || window.location.origin, phone || "");
  } catch {
    /* ignore */
  }
}
