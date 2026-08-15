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
