import { Capacitor, registerPlugin } from "@capacitor/core";

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
  return Capacitor.isNativePlatform();
}

export async function getNativeLocationStatus(): Promise<LocationPermissionStatus | null> {
  if (!isNativeApp()) return null;
  try {
    return await FieldBackgroundLocation.getLocationPermissionStatus();
  } catch {
    return null;
  }
}

export async function requestNativeLocationPermissions() {
  if (!isNativeApp()) return null;
  try {
    return await FieldBackgroundLocation.requestLocationPermissions();
  } catch {
    return null;
  }
}

export async function openNativeLocationSettings() {
  if (!isNativeApp()) return;
  await FieldBackgroundLocation.openLocationSettings().catch(() => {});
}

export async function syncNativeBackgroundTracking(punchInAt: string | null) {
  if (!isNativeApp()) return;

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
