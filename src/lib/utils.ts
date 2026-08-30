export const CSV_COLUMNS = [
  "Sector Incharge Name",
  "Sector Incharge Number",
  "Assembly Name",
  "Sector Allotted",
  "Zone",
  "District",
] as const;

export type CsvUserRow = {
  name: string;
  phone: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
};

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDuration(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} hr ${rem} min` : `${h} hr`;
}

export function formatKm(meters: number) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export type LatLng = { lat: number; lng: number };

export function pathDistance(points: LatLng[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversineMeters(points[i - 1], points[i]);
  return d;
}

/** Field travel: ignore GPS jitter, keep bike/car hops after screen-off. ~180 km/h cap. */
const TRACK_MIN_STEP_M = 8;
const TRACK_MAX_ACCURACY_M = 2000;
const TRACK_MAX_SPEED_MPS = 50;
const TRACK_MAX_GAP_M = 80_000;

export function isPlausibleStep(
  from: LatLng,
  to: LatLng,
  accuracy?: number | null,
  dtMs?: number | null
) {
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > TRACK_MAX_ACCURACY_M) return false;
  const gap = haversineMeters(from, to);
  if (gap < TRACK_MIN_STEP_M) return false;
  const dt = dtMs != null && Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 30 * 60 * 1000;
  const maxGap = Math.min(TRACK_MAX_GAP_M, Math.max(20_000, (dt / 1000) * TRACK_MAX_SPEED_MPS));
  if (gap > maxGap) return false;
  return true;
}

/** Best available km for a session: stored path, polyline, or punch-in → last known point. */
export function sessionTravelMeters(opts: {
  stored?: number | null;
  punchIn: LatLng;
  points?: LatLng[];
  punchOut?: LatLng | null;
  live?: LatLng | null;
}) {
  const pts = opts.points || [];
  const end = opts.live || opts.punchOut || pts[pts.length - 1] || null;
  const path = pathDistance([
    opts.punchIn,
    ...pts,
    ...(opts.punchOut ? [opts.punchOut] : []),
    ...(opts.live ? [opts.live] : []),
  ]);
  const crow = end ? haversineMeters(opts.punchIn, end) : 0;
  return Math.max(opts.stored || 0, path, crow);
}

export function splitTrack<T extends LatLng>(points: T[], maxGapMeters = 8000): T[][] {
  if (!points.length) return [];
  const segs: T[][] = [[points[0]]];
  for (let i = 1; i < points.length; i++) {
    const gap = haversineMeters(points[i - 1], points[i]);
    if (gap > maxGapMeters) segs.push([points[i]]);
    else segs[segs.length - 1].push(points[i]);
  }
  return segs;
}

export function downsample<T>(items: T[], max = 320): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(items[Math.floor(i * step)]);
  out.push(items[items.length - 1]);
  return out;
}

