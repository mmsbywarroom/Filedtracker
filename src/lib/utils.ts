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

export function splitTrack<T extends LatLng>(points: T[], maxGapMeters = 280): T[][] {
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

export function isPlausibleStep(from: LatLng, to: LatLng, accuracy?: number | null) {
  if (accuracy != null && accuracy > 200) return false;
  const gap = haversineMeters(from, to);
  if (gap < 2) return false;
  if (gap > 500) return false;
  return true;
}

