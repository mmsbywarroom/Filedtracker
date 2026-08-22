import { readFileSync } from "fs";
import { join } from "path";
import { haversineMeters } from "@/lib/utils";

export const ASSEMBLY_BUFFER_METERS = Number(process.env.ASSEMBLY_GEOFENCE_BUFFER_M || 200);
export const ASSEMBLY_GEOFENCE_ENABLED = process.env.ASSEMBLY_GEOFENCE_ENABLED !== "false";

type Ring = number[][];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };

type Feature = {
  properties: { acNo: number; acName: string };
  geometry: Geometry;
};

type GeoJson = { features: Feature[] };

export type AssemblyMatch = {
  acNo: number;
  acName: string;
  matchedAs: string;
};

export type GeofenceResult =
  | { ok: true; assembly: AssemblyMatch; inside: boolean; distanceMeters: number; scope: "assembly" | "punjab_chandigarh" }
  | { ok: false; error: string; code: "NO_ASSEMBLY" | "UNKNOWN_ASSEMBLY" | "OUTSIDE" };

/** These designations may punch anywhere inside Punjab + Chandigarh (not other states). */
export const STATEWIDE_PUNCH_DESIGNATIONS = new Set(["State", "Zone Coordinator", "ZLC", "DLC", "Cluster"]);

let regionCache: { geometries: Geometry[] } | null = null;

let cached: { byNorm: Map<string, Feature>; features: Feature[] } | null = null;

/** Manual aliases: app / spoken name → official map AC_NAME */
const ALIASES: Record<string, string> = {
  // Jalandhar (old Jullundur spelling)
  "jullundur central": "Jalandhar Central",
  "jullundur north": "Jalandhar North",
  "jullundur south": "Jalandhar West",
  "jullundur west": "Jalandhar West",
  "jullundur cantonment": "Jalandhar Cantt.",
  "jullundur cantt": "Jalandhar Cantt.",
  "jalandhar cantonment": "Jalandhar Cantt.",
  "jalandhar cantt": "Jalandhar Cantt.",
  "jalandhar cantt.": "Jalandhar Cantt.",

  // Patiala
  "patiala town": "Patiala",
  "patiala urban": "Patiala",
  "patiala city": "Patiala",
  "patiala rural": "Patiala Rural",

  // SAS Nagar
  "sas nagar": "S.A.S.Nagar",
  "s a s nagar": "S.A.S.Nagar",
  "s.a.s nagar": "S.A.S.Nagar",
  "s.a.s. nagar": "S.A.S.Nagar",
  "sahibzada ajit singh nagar": "S.A.S.Nagar",
  "mohali": "S.A.S.Nagar",

  // Bathinda
  "bhatinda": "Bathinda Urban",
  "bhatinda urban": "Bathinda Urban",
  "bhatinda rural": "Bathinda Rural",
  "bathinda": "Bathinda Urban",
  "bathinda town": "Bathinda Urban",

  // Common spelling / old names
  "ropar": "Rupnagar",
  "roopnagar": "Rupnagar",
  "anandpur sahib - ropar": "Anandpur Sahib",
  "anandpur sahib ropar": "Anandpur Sahib",
  "kot kapura": "Kotkapura",
  "giddar baha": "Gidderbaha",
  "gidder baha": "Gidderbaha",
  "nihal singh wala": "Nihal Singhwala",
  "nihal singhwala": "Nihal Singhwala",
  "srihargobindpur": "Sri Hargobindpur",
  "sri hargobindpur": "Sri Hargobindpur",
  "firozepur": "Firozpur City",
  "firozepur city": "Firozpur City",
  "firozepur cantonment": "Firozpur City",
  "firozpur": "Firozpur City",
  "firozpur cantonment": "Firozpur City",
  "firozpur rural": "Firozpur Rural",
  "khemkaran": "Khem Karan",
  "khadoor sahib": "Khadoor Sahib",
  "nawan shahar": "Nawan Shahr",
  "nawanshahr": "Nawan Shahr",
  "bagha purana": "Bhagha Purana",
  "baghapurana": "Bhagha Purana",
  "dirbha": "Dirba",
  "dakala": "Sanour",
  "pakka kalan": "Bhucho Mandi",
  "joga": "Maur",
  "kum kalan": "Sahnewal",
  "qila raipur": "Gill",
  "valtoha": "Khem Karan",
  "naushahra panwan": "Khadoor Sahib",
  "panjgrain": "Kotkapura",
  "morinda": "Chamkaur Sahib",
  "nangal": "Anandpur Sahib",
  "talwandi sabo": "Talwandi Sabo",
};

export function normalizeAssemblyName(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/sahibzada\s+ajit\s+singh\s+nagar/g, "sas nagar")
    .replace(/\bs\.?\s*a\.?\s*s\.?\s*nagar\b/g, "sas nagar")
    .replace(/\bcantt\.?\b/g, "cantt")
    .replace(/\bcantonment\b/g, "cantt")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsc\b|\bst\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function loadAssemblies() {
  if (cached) return cached;
  const path = join(process.cwd(), "data", "boundaries", "punjab-assemblies.geojson");
  const data = JSON.parse(readFileSync(path, "utf8")) as GeoJson;
  const byNorm = new Map<string, Feature>();
  for (const f of data.features) {
    const key = normalizeAssemblyName(f.properties.acName);
    byNorm.set(key, f);
  }
  // also index aliases → feature
  for (const [alias, official] of Object.entries(ALIASES)) {
    const feat = byNorm.get(normalizeAssemblyName(official));
    if (feat) byNorm.set(normalizeAssemblyName(alias), feat);
  }
  cached = { byNorm, features: data.features };
  return cached;
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cur = a[i] === b[j] ? row[j] : 1 + Math.min(row[j], row[j + 1], prev);
      row[j] = prev;
      prev = cur;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

/** Resolve app assemblyName to a map feature (handles Patiala vs Patiala Rural carefully). */
export function resolveAssemblyFeature(assemblyName: string): AssemblyMatch | null {
  const { byNorm, features } = loadAssemblies();
  const norm = normalizeAssemblyName(assemblyName);
  if (!norm) return null;

  const direct = byNorm.get(norm);
  if (direct) {
    return {
      acNo: direct.properties.acNo,
      acName: direct.properties.acName,
      matchedAs: assemblyName,
    };
  }

  const aliasTarget = ALIASES[norm];
  if (aliasTarget) {
    const feat = byNorm.get(normalizeAssemblyName(aliasTarget));
    if (feat) {
      return { acNo: feat.properties.acNo, acName: feat.properties.acName, matchedAs: assemblyName };
    }
  }

  // Prefer longest official name that equals or is contained carefully
  // e.g. "Patiala Rural" must not collapse to "Patiala"
  let best: { feat: Feature; score: number } | null = null;
  for (const feat of features) {
    const n = normalizeAssemblyName(feat.properties.acName);
    if (!n) continue;
    if (n === norm) {
      return { acNo: feat.properties.acNo, acName: feat.properties.acName, matchedAs: assemblyName };
    }
    // only allow containment when lengths are close or one is clearly the longer form
    if (n.startsWith(norm + " ") || norm.startsWith(n + " ")) {
      // "patiala" vs "patiala rural" — require the app name to include the extra token
      if (norm.length >= n.length) {
        const score = 1000 + norm.length;
        if (!best || score > best.score) best = { feat, score };
      }
      continue;
    }
    const dist = levenshtein(norm, n);
    const maxLen = Math.max(norm.length, n.length);
    if (maxLen >= 6 && dist <= Math.max(1, Math.floor(maxLen * 0.15))) {
      const score = 500 - dist * 10 + (n === norm ? 100 : 0);
      if (!best || score > best.score) best = { feat, score };
    }
  }

  if (best && best.score >= 480) {
    return {
      acNo: best.feat.properties.acNo,
      acName: best.feat.properties.acName,
      matchedAs: assemblyName,
    };
  }
  return null;
}

function pointInRing(lng: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geometry: Geometry) {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lng, lat, outer)) return false;
    for (const hole of holes) {
      if (pointInRing(lng, lat, hole)) return false;
    }
    return true;
  }
  for (const poly of geometry.coordinates) {
    const [outer, ...holes] = poly;
    if (!pointInRing(lng, lat, outer)) continue;
    let inHole = false;
    for (const hole of holes) {
      if (pointInRing(lng, lat, hole)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function distPointToSegmentMeters(p: { lat: number; lng: number }, a: number[], b: number[]) {
  // a,b = [lng, lat]
  const ax = a[0];
  const ay = a[1];
  const bx = b[0];
  const by = b[1];
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return haversineMeters(p, { lat: ay, lng: ax });
  const t = Math.max(0, Math.min(1, ((p.lng - ax) * dx + (p.lat - ay) * dy) / (dx * dx + dy * dy)));
  return haversineMeters(p, { lat: ay + t * dy, lng: ax + t * dx });
}

function minDistanceToGeometryMeters(lat: number, lng: number, geometry: Geometry) {
  const p = { lat, lng };
  let min = Number.POSITIVE_INFINITY;
  const rings: Ring[] =
    geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      min = Math.min(min, distPointToSegmentMeters(p, ring[i], ring[i + 1]));
    }
  }
  return min;
}

function loadPunjabChandigarh() {
  if (regionCache) return regionCache;
  const path = join(process.cwd(), "data", "boundaries", "punjab-chandigarh.geojson");
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    features: { geometry: Geometry }[];
  };
  regionCache = { geometries: data.features.map((f) => f.geometry) };
  return regionCache;
}

function assertInsidePunjabChandigarh(opts: {
  lat: number;
  lng: number;
  bufferMeters?: number;
  designation: string;
}): GeofenceResult {
  const buffer = opts.bufferMeters ?? ASSEMBLY_BUFFER_METERS;
  const { geometries } = loadPunjabChandigarh();
  let bestDist = Number.POSITIVE_INFINITY;
  for (const geometry of geometries) {
    if (pointInGeometry(opts.lng, opts.lat, geometry)) {
      return {
        ok: true,
        assembly: { acNo: 0, acName: "Punjab / Chandigarh", matchedAs: opts.designation },
        inside: true,
        distanceMeters: 0,
        scope: "punjab_chandigarh",
      };
    }
    bestDist = Math.min(bestDist, minDistanceToGeometryMeters(opts.lat, opts.lng, geometry));
  }
  if (bestDist <= buffer) {
    return {
      ok: true,
      assembly: { acNo: 0, acName: "Punjab / Chandigarh", matchedAs: opts.designation },
      inside: false,
      distanceMeters: bestDist,
      scope: "punjab_chandigarh",
    };
  }
  return {
    ok: false,
    code: "OUTSIDE",
    error:
      "Punch is allowed only inside Punjab or Chandigarh for your designation. Delhi and other states are not allowed.",
  };
}

function checkSingleAssembly(
  assemblyName: string,
  lat: number,
  lng: number,
  buffer: number
): GeofenceResult {
  const match = resolveAssemblyFeature(assemblyName);
  if (!match) {
    return {
      ok: false,
      code: "UNKNOWN_ASSEMBLY",
      error: `Assembly boundary not found for "${assemblyName}". Contact admin to fix the assembly name.`,
    };
  }
  const { byNorm } = loadAssemblies();
  const feat = byNorm.get(normalizeAssemblyName(match.acName));
  if (!feat) {
    return {
      ok: false,
      code: "UNKNOWN_ASSEMBLY",
      error: `Assembly boundary not found for "${assemblyName}". Contact admin to fix the assembly name.`,
    };
  }

  const inside = pointInGeometry(lng, lat, feat.geometry);
  if (inside) {
    return { ok: true, assembly: match, inside: true, distanceMeters: 0, scope: "assembly" };
  }
  const distanceMeters = minDistanceToGeometryMeters(lat, lng, feat.geometry);
  if (distanceMeters <= buffer) {
    return { ok: true, assembly: match, inside: false, distanceMeters, scope: "assembly" };
  }
  return {
    ok: false,
    code: "OUTSIDE",
    error: `You are outside your assigned assembly (${match.acName}) — about ${Math.round(distanceMeters)} m from the boundary. Move inside the assembly or enable high-accuracy GPS, then try again (within ${buffer} m of the boundary).`,
  };
}

/** ALC may have multiple mapped assemblies — punch allowed inside any one. */
export function userAssemblyNames(opts: {
  designation?: string | null;
  assemblyName?: string | null;
  assemblies?: string[] | null;
}): string[] {
  const designation = String(opts.designation || "").trim();
  const fromArr = (opts.assemblies || []).map((a) => String(a || "").trim()).filter(Boolean);
  if (designation === "ALC" && fromArr.length) {
    return Array.from(new Set(fromArr));
  }
  const primary = String(opts.assemblyName || "").trim();
  return primary ? [primary] : [];
}

export function assertInsideAssignedAssembly(opts: {
  assemblyName: string | null | undefined;
  assemblies?: string[] | null;
  designation?: string | null;
  lat: number;
  lng: number;
  bufferMeters?: number;
}): GeofenceResult {
  if (!ASSEMBLY_GEOFENCE_ENABLED) {
    return {
      ok: true,
      assembly: { acNo: 0, acName: String(opts.assemblyName || ""), matchedAs: String(opts.assemblyName || "") },
      inside: true,
      distanceMeters: 0,
      scope: "assembly",
    };
  }

  const designation = String(opts.designation || "").trim();
  if (STATEWIDE_PUNCH_DESIGNATIONS.has(designation)) {
    return assertInsidePunjabChandigarh({
      lat: opts.lat,
      lng: opts.lng,
      bufferMeters: opts.bufferMeters,
      designation,
    });
  }

  const buffer = opts.bufferMeters ?? ASSEMBLY_BUFFER_METERS;
  const names = userAssemblyNames(opts);
  if (!names.length) {
    return {
      ok: false,
      code: "NO_ASSEMBLY",
      error: "Your account has no assembly assigned. Contact admin.",
    };
  }

  if (names.length === 1) {
    return checkSingleAssembly(names[0], opts.lat, opts.lng, buffer);
  }

  // ALC — inside ANY mapped assembly
  let nearest: { name: string; acName: string; distance: number } | null = null;
  for (const name of names) {
    const match = resolveAssemblyFeature(name);
    if (!match) continue;
    const { byNorm } = loadAssemblies();
    const feat = byNorm.get(normalizeAssemblyName(match.acName));
    if (!feat) continue;
    if (pointInGeometry(opts.lng, opts.lat, feat.geometry)) {
      return { ok: true, assembly: match, inside: true, distanceMeters: 0, scope: "assembly" };
    }
    const dist = minDistanceToGeometryMeters(opts.lat, opts.lng, feat.geometry);
    if (dist <= buffer) {
      return { ok: true, assembly: match, inside: false, distanceMeters: dist, scope: "assembly" };
    }
    if (!nearest || dist < nearest.distance) {
      nearest = { name, acName: match.acName, distance: dist };
    }
  }

  const label = names.join(", ");
  if (nearest) {
    return {
      ok: false,
      code: "OUTSIDE",
      error: `You are outside all your mapped assemblies (${label}). Nearest is ${nearest.acName} (${Math.round(nearest.distance)} m away). Punch within ${buffer} m of any mapped assembly boundary.`,
    };
  }
  return {
    ok: false,
    code: "UNKNOWN_ASSEMBLY",
    error: `Assembly boundary not found for mapped assemblies (${label}). Contact admin.`,
  };
}

/** For admin/debug: list all official map names */
export function listOfficialAssemblies() {
  return loadAssemblies().features.map((f) => ({
    acNo: f.properties.acNo,
    acName: f.properties.acName,
  }));
}
