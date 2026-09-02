"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";
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

export interface FieldBackgroundLocationPlugin {
  startTracking(options: StartTrackingOptions): Promise<{ ok: boolean; needsSettings?: boolean; message?: string }>;
  stopTracking(): Promise<{ ok: boolean }>;
  isTracking(): Promise<{ active: boolean }>;
  getLocationPermissionStatus(): Promise<LocationPermissionStatus>;
  requestLocationPermissions(): Promise<LocationPermissionStatus & { needsSettings?: boolean }>;
  openLocationSettings(): Promise<void>;
  clearAppCookies(): Promise<void>;
}

const webStub: FieldBackgroundLocationPlugin = {
  async startTracking() {
    return { ok: false };
  },
  async stopTracking() {
    return { ok: false };
  },
  async isTracking() {
    return { active: false };
  },
  async getLocationPermissionStatus() {
    return { foreground: false, background: false, needsSettings: false };
  },
  async requestLocationPermissions() {
    return { foreground: false, background: false, needsSettings: false };
  },
  async openLocationSettings() {},
  async clearAppCookies() {},
};

export const FieldBackgroundLocation = registerPlugin<FieldBackgroundLocationPlugin>(
  "FieldBackgroundLocation",
  {
    web: () => Promise.resolve(webStub),
  }
);

export function isNativeApp() {
  return isPureNativeApp() || Capacitor.isNativePlatform();
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
  if (bridge) {
    return parsePermissionJson(bridge.getLocationPermissionStatus());
  }
  try {
    return await FieldBackgroundLocation.getLocationPermissionStatus();
  } catch {
    return null;
  }
}

export async function requestNativeLocationPermissions() {
  if (!isNativeApp()) return null;
  const bridge = pureNativeBridge();
  if (bridge) {
    return parsePermissionJson(bridge.requestLocationPermissions());
  }
  try {
    return await FieldBackgroundLocation.requestLocationPermissions();
  } catch {
    return null;
  }
}

export async function openNativeLocationSettings() {
  if (!isNativeApp()) return;
  const bridge = pureNativeBridge();
  if (bridge) {
    bridge.openLocationSettings();
    return;
  }
  await FieldBackgroundLocation.openLocationSettings().catch(() => {});
}

export async function syncNativeBackgroundTracking(punchInAt: string | null) {
  if (!isNativeApp()) return;

  const bridge = pureNativeBridge();
  if (bridge) {
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
    return;
  }

  if (!punchInAt) {
    await FieldBackgroundLocation.stopTracking().catch(() => {});
    return;
  }

  const tokenRes = await fetch("/api/auth/mobile-token", { cache: "no-store" });
  if (!tokenRes.ok) return;
  const data = (await tokenRes.json()) as { token?: string; apiBaseUrl?: string };
  if (!data.token) return;

  const apiBaseUrl =
    data.apiBaseUrl?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");

  await FieldBackgroundLocation.startTracking({
    apiBaseUrl,
    authToken: data.token,
    punchInAt,
  }).catch(() => {});
}
