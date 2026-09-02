export function isIosBrowser() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function geoFail(err: GeolocationPositionError | Error) {
  const code = "code" in err ? err.code : 0;
  if (code === 1) {
    throw new Error(
      "Location blocked. iPhone: Settings → Safari/Chrome → Location → Allow, then reload this page."
    );
  }
  if (code === 3) {
    throw new Error("GPS timed out. Step outdoors or near a window, then tap Show my location again.");
  }
  throw new Error("Location not found. Turn on Location Services in iPhone Settings, then try again.");
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Quick cached / network fix — best first call on iOS (same user tap). */
export function getPositionQuick(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is off. Turn on Location in iPhone Settings."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (e) => reject(geoFail(e)),
      {
        enableHighAccuracy: false,
        timeout: isIosBrowser() ? 5000 : 4000,
        maximumAge: 300000,
      }
    );
  });
}

/** Max ~8s — never spin “Finding you…” for 25s on iPhone. */
export async function locateDevice(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw new Error("Location is off. Turn on Location in iPhone Settings.");
  }
  try {
    return await withTimeout(getPositionQuick(), 5000, "Quick locate timed out");
  } catch {
    return withTimeout(
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation!.getCurrentPosition(resolve, (e) => reject(geoFail(e)), {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 120000,
        });
      }),
      9000,
      "GPS timed out. Tap Show my location on the map, allow Location, then try Punch In."
    );
  }
}

export type GpsFix = { lat: number; lng: number; accuracy: number | null; at: number };

export type GpsSample = GpsFix;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getHighAccuracyPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location is off. Turn on Location in phone Settings."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(geoFail(e)), {
      enableHighAccuracy: true,
      timeout: isIosBrowser() ? 14000 : 12000,
      maximumAge: 0,
    });
  });
}

/** Collect multiple GPS fixes while user stands still — used before punch in/out. */
export async function collectGpsSamplesForPunch(opts?: { count?: number; intervalMs?: number }) {
  const count = opts?.count ?? 4;
  const intervalMs = opts?.intervalMs ?? 2500;
  const samples: GpsSample[] = [];

  for (let i = 0; i < count; i++) {
    const pos = await withTimeout(
      getHighAccuracyPosition(),
      isIosBrowser() ? 15000 : 13000,
      "GPS timed out. Step outdoors, allow location, then try again."
    );
    samples.push({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      at: Date.now(),
    });
    if (i < count - 1) await sleep(intervalMs);
  }

  const last = samples[samples.length - 1];
  return { samples, lat: last.lat, lng: last.lng, accuracy: last.accuracy };
}

export async function captureGpsFix(
  lastFix: { lat: number; lng: number } | null,
  liveAccuracy: number
): Promise<GpsFix> {
  try {
    const pos = await locateDevice();
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
      at: Date.now(),
    };
  } catch (e) {
    if (lastFix) {
      return {
        lat: lastFix.lat,
        lng: lastFix.lng,
        accuracy: Number.isFinite(liveAccuracy) && liveAccuracy < 9000 ? liveAccuracy : null,
        at: Date.now(),
      };
    }
    throw e;
  }
}
