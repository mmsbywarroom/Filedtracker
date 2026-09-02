import { Capacitor, registerPlugin } from "@capacitor/core";

export type StartTrackingOptions = {
  apiBaseUrl: string;
  authToken: string;
  punchInAt: string;
};

export interface FieldBackgroundLocationPlugin {
  startTracking(options: StartTrackingOptions): Promise<{ ok: boolean }>;
  stopTracking(): Promise<{ ok: boolean }>;
  isTracking(): Promise<{ active: boolean }>;
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
