import { haversineMeters } from "@/lib/utils";

export const CALL_CENTER_RADIUS_M = 500;

export type CallCenterSite = {
  name: string;
  lat: number;
  lng: number;
};

const SITES: { name: string; lat: number; lng: number; keys: string[] }[] = [
  {
    name: "Unify",
    lat: 30.6380625,
    lng: 76.7307417,
    keys: ["unify"],
  },
  {
    name: "Yellow Stone",
    lat: 30.6812107,
    lng: 76.7279254,
    keys: ["yellowstone", "yellow stone"],
  },
];

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function resolveCallCenterSite(sectorAllotted?: string | null): CallCenterSite | null {
  const raw = String(sectorAllotted || "").trim();
  if (!raw) return null;
  const n = norm(raw);
  for (const site of SITES) {
    if (site.keys.some((k) => n.includes(norm(k)) || norm(k).includes(n))) {
      return { name: site.name, lat: site.lat, lng: site.lng };
    }
  }
  return null;
}

export function isCallCenterDesignation(designation?: string | null) {
  return String(designation || "").trim() === "Call Center";
}

export type CallCenterGeoResult =
  | { ok: true; site: CallCenterSite; distanceMeters: number }
  | { ok: false; error: string; code: "NO_SITE" | "OUTSIDE"; distanceMeters?: number; site?: CallCenterSite };

export function assertInsideCallCenterSite(opts: {
  sectorAllotted?: string | null;
  lat: number;
  lng: number;
  radiusMeters?: number;
}): CallCenterGeoResult {
  const site = resolveCallCenterSite(opts.sectorAllotted);
  if (!site) {
    return {
      ok: false,
      code: "NO_SITE",
      error: "Call Center sector is not mapped (use Unify or Yellow Stone). Contact admin.",
    };
  }
  const radius = opts.radiusMeters ?? CALL_CENTER_RADIUS_M;
  const distanceMeters = haversineMeters({ lat: opts.lat, lng: opts.lng }, { lat: site.lat, lng: site.lng });
  if (distanceMeters <= radius) {
    return { ok: true, site, distanceMeters };
  }
  return {
    ok: false,
    code: "OUTSIDE",
    site,
    distanceMeters,
    error: `You are outside ${site.name} (${Math.round(distanceMeters)} m away). Punch only within ${radius} m of the office.`,
  };
}
