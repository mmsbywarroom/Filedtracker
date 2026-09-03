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
function reportSecurityViolation(
  type: "vpn" | "mock_gps" | "spoof_app" | "punch_evidence",
  action: string,
  detail: string,
  lat?: number | null,
  lng?: number | null
) {
  const bridge = pureNativeBridge();
  try {
    bridge?.reportSecurityEvent?.(type, action, detail);
  } catch {
    /* ignore */
  }
  try {
    const body: Record<string, unknown> = { type, action, detail };
    if (Number.isFinite(lat)) body.lat = lat;
    if (Number.isFinite(lng)) body.lng = lng;
    void fetch("/api/attendance/security-event", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Source": "native",
      },
      body: JSON.stringify(body),
    });
  } catch {
    /* ignore */
  }
}

/**
 * One solid evidence log per user/day: third-party VPN/Fake GPS apps present at native punch.
 * Does not block punch — Attendance FLAG catches fixed fake GPS coords.
 */
export function assertNativeSecureForPunch(): void {
  const bridge = pureNativeBridge();
  if (!bridge) return;
  const status = readNativeSecurityStatus();
  if (!status) return;

  const apps: string[] = [];
  if (status.vpnPackage || status.vpnActive || status.vpn) {
    if (status.vpnPackage) {
      apps.push(`VPN app: ${status.vpnPackage}${status.vpnActive ? " (connected)" : ""}`);
    } else if (status.vpnActive || status.vpn) {
      apps.push("VPN connected on device");
    }
  }
  if (status.spoofPackage || status.spoofApp || status.mockLikely) {
    apps.push(
      status.spoofPackage
        ? `Fake GPS / spoof app: ${status.spoofPackage}`
        : "Fake GPS / spoof app detected"
    );
  }
  if (!apps.length) return;

  const detail = `Apps at native punch-in: ${apps.join("; ")}. Pakka device evidence — third-party app(s) on phone when punching in native app.`;
  reportSecurityViolation("punch_evidence", "punch_evidence", detail);
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
