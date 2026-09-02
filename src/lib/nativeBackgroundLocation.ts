"use client";

import { isPureNativeApp, pureNativeBridge } from "@/lib/pureNativeApp";

export type StartTrackingOptions = {
  apiBaseUrl: string;
  authToken: string;
  punchInAt: string;
};

export type LocationPermissionStatus = {
  foreground: boolean;
  background: boolean;
  needsSettings: boolean;
};

export function isNativeApp() {
  return isPureNativeApp();
}

function parsePermissionJson(raw: string | null | undefined): LocationPermissionStatus {
  try {
    const o = JSON.parse(raw || "{}") as LocationPermissionStatus;
    return {
      foreground: Boolean(o.foreground),
      background: Boolean(o.background),
      needsSettings: Boolean(o.needsSettings),
    };
  } catch {
    return { foreground: false, background: false, needsSettings: false };
  }
}

export async function getNativeLocationStatus(): Promise<LocationPermissionStatus | null> {
  if (!isNativeApp()) return null;
  const bridge = pureNativeBridge();
  if (!bridge) return null;
  return parsePermissionJson(bridge.getLocationPermissionStatus());
}

export async function requestNativeLocationPermissions() {
  if (!isNativeApp()) return null;
  const bridge = pureNativeBridge();
  if (!bridge) return null;
  return parsePermissionJson(bridge.requestLocationPermissions());
}

export async function openNativeLocationSettings() {
  if (!isNativeApp()) return;
  pureNativeBridge()?.openLocationSettings();
}

export async function syncNativeBackgroundTracking(punchInAt: string | null) {
  if (!isNativeApp()) return;

  const bridge = pureNativeBridge();
  if (!bridge) return;

  if (!punchInAt) {
    bridge.stopTracking();
    return;
  }

  const tokenRes = await fetch("/api/auth/mobile-token", { cache: "no-store", credentials: "include" });
  if (!tokenRes.ok) return;
  const data = (await tokenRes.json()) as { token?: string; apiBaseUrl?: string };
  if (!data.token) return;
  const apiBaseUrl =
    data.apiBaseUrl?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  bridge.startTracking(apiBaseUrl, data.token, punchInAt);
}
