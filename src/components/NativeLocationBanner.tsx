"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getNativeLocationStatus,
  isNativeApp,
  openNativeLocationSettings,
  requestNativeLocationPermissions,
  syncNativeBackgroundTracking,
  type LocationPermissionStatus,
} from "@/lib/nativeBackgroundLocation";

export function NativeLocationBanner({ punchedIn, punchInAt }: { punchedIn: boolean; punchInAt?: string | null }) {
  const [status, setStatus] = useState<LocationPermissionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!isNativeApp()) return;
    setStatus(await getNativeLocationStatus());
  }, []);

  useEffect(() => {
    void refresh();
    const onResume = () => void refresh();
    window.addEventListener("ft-app-resume", onResume);
    return () => window.removeEventListener("ft-app-resume", onResume);
  }, [refresh, punchedIn]);

  async function startPermissionFlow() {
    setBusy(true);
    try {
      const res = await requestNativeLocationPermissions();
      if (res) setStatus(res);
      if (res?.needsSettings) openNativeLocationSettings();
    } finally {
      setBusy(false);
    }
  }

  if (!isNativeApp() || !status) return null;

  if (status.background && punchedIn) {
    return (
      <div className="mb-3 rounded-2xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-navy">
        <p className="font-semibold">Background GPS on</p>
        <p className="mt-1 text-xs text-navy/70">Har 30 minute location record hogi — screen off / WhatsApp pe bhi.</p>
      </div>
    );
  }

  if (!status.foreground) {
    return (
      <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Location permission (2 steps)</p>
        <p className="mt-1 text-xs">
          Android pe pehle popup mein sirf 3 options aate hain. <strong>While using the app</strong> dabao — uske
          baad Settings mein <strong>Allow all the time</strong> milega.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void startPermissionFlow()}
          className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-70"
        >
          {busy ? "Please wait…" : "Step 1 — Allow location (While using app)"}
        </button>
      </div>
    );
  }

  if (status.needsSettings || !status.background) {
    return (
      <div className="mb-3 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
        <p className="font-semibold">Step 2 — Allow all the time</p>
        <p className="mt-1 text-xs">
          Pehle step complete ho gaya. Ab Settings khulegi → <strong>Permissions → Location → Allow all the time</strong>
        </p>
        <button
          type="button"
          onClick={() => openNativeLocationSettings()}
          className="mt-3 w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Open Settings → Allow all the time
        </button>
        {punchedIn && punchInAt && (
          <button
            type="button"
            onClick={() => {
              void syncNativeBackgroundTracking(punchInAt);
              void refresh();
            }}
            className="mt-2 w-full rounded-xl border border-red-300 bg-white px-4 py-2 text-xs font-semibold text-red-800"
          >
            Settings ke baad yahan tap karo (retry)
          </button>
        )}
      </div>
    );
  }

  return null;
}
