"use client";

import { isNativeApp } from "@/lib/nativeBackgroundLocation";
import { isPureNativeApp, pureNativeBridge } from "@/lib/pureNativeApp";

export async function ensureNativeCameraPermission(): Promise<boolean> {
  if (!isNativeApp()) return true;
  if (isPureNativeApp()) {
    pureNativeBridge()?.requestCameraPermission?.();
  }
  return true;
}

export async function logoutUser() {
  if (isNativeApp()) {
    pureNativeBridge()?.stopTracking();
  }

  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});

  if (isNativeApp()) {
    pureNativeBridge()?.clearSessionAndCookies();
  }

  window.location.replace("/?relogin=1");
}
