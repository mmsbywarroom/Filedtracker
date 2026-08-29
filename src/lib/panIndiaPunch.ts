import { normalizePhone } from "@/lib/security";

/**
 * These numbers may punch in/out from anywhere in India
 * (no assembly / Call Center office geofence).
 */
const PAN_INDIA_PUNCH_PHONES = new Set(["9625692122"]);

/** Rough mainland + islands bounding box — not a legal border, just blocks absurd coords */
export function isInsideIndiaRough(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= 6.5 && lat <= 37.5 && lng >= 68 && lng <= 97.8;
}

export function isPanIndiaPunchPhone(phone: string | null | undefined) {
  const n = phone ? normalizePhone(phone) : null;
  return Boolean(n && PAN_INDIA_PUNCH_PHONES.has(n));
}

export function assertPanIndiaPunchLocation(lat: number, lng: number): { ok: true } | { ok: false; error: string; code: string } {
  if (!isInsideIndiaRough(lat, lng)) {
    return {
      ok: false,
      code: "OUTSIDE_INDIA",
      error: "Punch location must be within India.",
    };
  }
  return { ok: true };
}
