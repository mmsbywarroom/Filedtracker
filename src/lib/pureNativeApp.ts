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
  spoofApp: boolean;
  spoofPackage: string;
  mockLikely: boolean;
};

export function readNativeSecurityStatus(): NativeSecurityStatus | null {
  const bridge = pureNativeBridge();
  if (!bridge?.getSecurityStatus) return null;
  try {
    const o = JSON.parse(bridge.getSecurityStatus()) as NativeSecurityStatus;
    return {
      vpn: Boolean(o.vpn),
      spoofApp: Boolean(o.spoofApp),
      spoofPackage: String(o.spoofPackage || ""),
      mockLikely: Boolean(o.mockLikely),
    };
  } catch {
    return null;
  }
}

/** Block punch when VPN / spoof apps detected; also report to admin. */
export function assertNativeSecureForPunch(): void {
  const bridge = pureNativeBridge();
  if (!bridge) return;
  const status = readNativeSecurityStatus();
  if (!status) return;

  if (status.vpn) {
    bridge.reportSecurityEvent?.("vpn", "blocked", "VPN active on punch attempt");
    throw new Error("Turn off VPN before punch in/out.");
  }
  if (status.spoofApp) {
    bridge.reportSecurityEvent?.(
      "spoof_app",
      "blocked",
      status.spoofPackage || "Fake GPS / location changer app installed"
    );
    throw new Error("Remove fake GPS / location changer apps from this phone.");
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
