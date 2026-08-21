import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { assertInsideAssignedAssembly, resolveAssemblyFeature } from "../src/lib/assemblyGeofence";

type Ring = number[][];
type Geometry =
  | { type: "Polygon"; coordinates: Ring[] }
  | { type: "MultiPolygon"; coordinates: Ring[][] };
type Feat = { properties: { acNo: number; acName: string }; geometry: Geometry };

const geo = JSON.parse(readFileSync(join("data", "boundaries", "punjab-assemblies.geojson"), "utf8")) as {
  features: Feat[];
};

function pointInRing(lng: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geometry: Geometry) {
  if (geometry.type === "Polygon") {
    const [outer, ...holes] = geometry.coordinates;
    if (!pointInRing(lng, lat, outer)) return false;
    for (const hole of holes) if (pointInRing(lng, lat, hole)) return false;
    return true;
  }
  for (const poly of geometry.coordinates) {
    const [outer, ...holes] = poly;
    if (!pointInRing(lng, lat, outer)) continue;
    if (holes.some((h) => pointInRing(lng, lat, h))) continue;
    return true;
  }
  return false;
}

/** Find a point guaranteed inside the polygon (grid search in bbox). */
function findInsidePoint(geometry: Geometry): { lat: number; lng: number } | null {
  const rings: Ring[] =
    geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  for (const steps of [20, 40, 80]) {
    for (let i = 1; i < steps; i++) {
      for (let j = 1; j < steps; j++) {
        const lng = minX + ((maxX - minX) * i) / steps;
        const lat = minY + ((maxY - minY) * j) / steps;
        if (pointInGeometry(lng, lat, geometry)) return { lat, lng };
      }
    }
  }
  return null;
}

const names = [
  "Patiala",
  "Patiala Rural",
  "Jalandhar Central",
  "Jullundur Central",
  "Kharar",
  "S.A.S. Nagar",
  "Mohali",
  "Khem Karan",
  "Dera Baba Nanak",
  "Amritsar North",
  "Bathinda Urban",
  "Bhatinda",
  "Ropar",
  "Rupnagar",
];

const delhi = { lat: 28.6139, lng: 77.209 };
let pass = 0;
let fail = 0;
const rows: Record<string, unknown>[] = [];

for (const appName of names) {
  const match = resolveAssemblyFeature(appName);
  if (!match) {
    fail++;
    rows.push({ appName, result: "FAIL", reason: "name not resolved" });
    continue;
  }
  const feat = geo.features.find((f) => f.properties.acNo === match.acNo)!;
  const home = findInsidePoint(feat.geometry);
  if (!home) {
    fail++;
    rows.push({ appName, map: match.acName, result: "FAIL", reason: "no inside point found" });
    continue;
  }
  const inside = assertInsideAssignedAssembly({ assemblyName: appName, lat: home.lat, lng: home.lng });
  const outside = assertInsideAssignedAssembly({ assemblyName: appName, lat: delhi.lat, lng: delhi.lng });
  const okInside = inside.ok === true;
  const okOutside = outside.ok === false && "code" in outside && outside.code === "OUTSIDE";
  const ok = okInside && okOutside;
  if (ok) pass++;
  else fail++;
  rows.push({
    appName,
    map: match.acName,
    acNo: match.acNo,
    homePoint: home,
    insideHome: okInside ? "ALLOW" : "BLOCK",
    outsideDelhi: okOutside ? "BLOCK" : "ALLOW",
    result: ok ? "PASS" : "FAIL",
  });
}

let allInsideOk = 0;
let allInsideFail = 0;
const insideFails: string[] = [];
let allOutsideOk = 0;
for (const f of geo.features) {
  const home = findInsidePoint(f.geometry);
  if (!home) {
    allInsideFail++;
    insideFails.push(f.properties.acName + " (no point)");
    continue;
  }
  const inside = assertInsideAssignedAssembly({
    assemblyName: f.properties.acName,
    lat: home.lat,
    lng: home.lng,
  });
  const outside = assertInsideAssignedAssembly({
    assemblyName: f.properties.acName,
    lat: delhi.lat,
    lng: delhi.lng,
  });
  if (inside.ok) allInsideOk++;
  else {
    allInsideFail++;
    insideFails.push(f.properties.acName);
  }
  if (!outside.ok && "code" in outside && outside.code === "OUTSIDE") allOutsideOk++;
}

// Wrong assembly: Patiala user standing in Kharar must block
const kharar = geo.features.find((f) => f.properties.acName === "Kharar")!;
const khararPt = findInsidePoint(kharar.geometry)!;
const wrongAssembly = assertInsideAssignedAssembly({
  assemblyName: "Patiala",
  lat: khararPt.lat,
  lng: khararPt.lng,
});

const patiala = geo.features.find((f) => f.properties.acName === "Patiala")!;
const rural = geo.features.find((f) => f.properties.acName === "Patiala Rural")!;
const pHome = findInsidePoint(patiala.geometry)!;
const rHome = findInsidePoint(rural.geometry)!;

const report = {
  verdict:
    pass === names.length && allInsideFail === 0 && allOutsideOk === 117 && !wrongAssembly.ok
      ? "OK — inside own assembly ALLOW, outside BLOCK"
      : "ISSUES FOUND",
  summary: {
    namedTestsPass: pass,
    namedTestsFail: fail,
    all117_insideOwn_ALLOW: allInsideOk,
    all117_insideOwn_FAIL: allInsideFail,
    all117_outsideDelhi_BLOCK: allOutsideOk,
    patialaUser_in_kharar: wrongAssembly.ok ? "ALLOW (BUG)" : "BLOCK (correct)",
    patiala_at_patialaHome: assertInsideAssignedAssembly({
      assemblyName: "Patiala",
      lat: pHome.lat,
      lng: pHome.lng,
    }).ok
      ? "ALLOW"
      : "BLOCK",
    rural_at_ruralHome: assertInsideAssignedAssembly({
      assemblyName: "Patiala Rural",
      lat: rHome.lat,
      lng: rHome.lng,
    }).ok
      ? "ALLOW"
      : "BLOCK",
    patiala_at_ruralHome: assertInsideAssignedAssembly({
      assemblyName: "Patiala",
      lat: rHome.lat,
      lng: rHome.lng,
    }).ok
      ? "ALLOW"
      : "BLOCK",
    rural_at_patialaHome: assertInsideAssignedAssembly({
      assemblyName: "Patiala Rural",
      lat: pHome.lat,
      lng: pHome.lng,
    }).ok
      ? "ALLOW"
      : "BLOCK",
  },
  rows,
  insideFails,
};

writeFileSync(join("data", "boundaries", "geofence-check.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
