declare global {
  interface Window {
    NativeAppBridge?: {
      startTracking(apiBase: string, token: string, punchInAt: string): void;
      stopTracking(): void;
      getLocationPermissionStatus(): string;
      requestLocationPermissions(): string;
      requestCameraPermission(): void;
      getStatusBarHeightPx(): number;
      getNavigationBarHeightPx(): number;
      openLocationSettings(): void;
      clearSessionAndCookies(): void;
      exitApp(): void;
    };
    __PURE_NATIVE_APP__?: boolean;
  }
}

/** Pure native Android app (WebView shell), not Capacitor. */
export function isPureNativeApp() {
  if (typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("AAPNative/")) return true;
  return window.__PURE_NATIVE_APP__ === true || !!window.NativeAppBridge;
}

export function pureNativeBridge() {
  if (!isPureNativeApp()) return null;
  return window.NativeAppBridge ?? null;
}
