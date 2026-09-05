import { haversineMeters } from "./haversine";

export type LocPoint = {
  lat: number;
  lng: number;
  atMs: number;
  isMock?: boolean;
  sampleId?: string;
};

/**
 * Flag physically unrealistic travel between consecutive samples.
 * Single glitches can happen — callers should require repeat/pattern for higher weight.
 * Threshold: > 200 km/h implied speed AND distance > 2 km.
 */
export function findImpossibleTravel(
  points: LocPoint[],
  opts?: { maxKmh?: number; minDistanceM?: number }
): Array<{
  from: LocPoint;
  to: LocPoint;
  distanceM: number;
  timeSec: number;
  speedKmh: number;
}> {
  const maxKmh = opts?.maxKmh ?? 200;
  const minDistanceM = opts?.minDistanceM ?? 2000;
  const sorted = [...points].sort((a, b) => a.atMs - b.atMs);
  const out: Array<{
    from: LocPoint;
    to: LocPoint;
    distanceM: number;
    timeSec: number;
    speedKmh: number;
  }> = [];

  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const dtSec = (b.atMs - a.atMs) / 1000;
    if (dtSec <= 0.5) continue;
    const distanceM = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    if (distanceM < minDistanceM) continue;
    const speedKmh = (distanceM / 1000) / (dtSec / 3600);
    if (speedKmh >= maxKmh) {
      out.push({ from: a, to: b, distanceM, timeSec: dtSec, speedKmh });
    }
  }
  return out;
}
