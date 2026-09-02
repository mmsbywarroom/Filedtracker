"use client";

import { FieldBackgroundLocation, isNativeApp } from "@/lib/nativeBackgroundLocation";
import { isPureNativeApp, pureNativeBridge } from "@/lib/pureNativeApp";

export async function ensureNativeCameraPermission(): Promise<boolean> {
  if (!isNativeApp()) return true;
  if (isPureNativeApp()) {
    pureNativeBridge()?.requestCameraPermission?.();
    return true;
  }
  try {
    const { Camera } = await import("@capacitor/camera");
    const cur = await Camera.checkPermissions();
    if (cur.camera === "granted" || cur.camera === "limited") return true;
    const req = await Camera.requestPermissions({ permissions: ["camera"] });
    return req.camera === "granted" || req.camera === "limited";
  } catch {
    return true;
  }
}

export async function logoutUser() {
  if (isNativeApp()) {
    const bridge = pureNativeBridge();
    if (bridge) {
      bridge.stopTracking();
    } else {
      await FieldBackgroundLocation.stopTracking().catch(() => {});
    }
  }

  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});

  if (isNativeApp()) {
    const bridge = pureNativeBridge();
    if (bridge) {
      bridge.clearSessionAndCookies();
      window.location.replace("/?relogin=1");
      return;
    }
    try {
      await FieldBackgroundLocation.clearAppCookies();
    } catch {
      /* ignore */
    }
  }

  window.location.replace("/?relogin=1");
}
