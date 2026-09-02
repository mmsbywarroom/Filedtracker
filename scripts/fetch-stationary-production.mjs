/**
 * Fetch last N days same-location sessions from live site (admin API).
 * Usage: node scripts/fetch-stationary-production.mjs [--days=7] [--max-m=80] [--base=https://filed.videh.co.in]
 */
import { writeFileSync } from "fs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const DAYS = Number(args.days || 7);
const MAX_M = Number(args["max-m"] || 80);
const BASE = (args.base || "https://filed.videh.co.in").replace(/\/$/, "");
const EMAIL = process.env.ADMIN_EMAIL || "admin@fieldtrack.local";
const PASS = process.env.ADMIN_PASSWORD || "Admin@12345";
const OUT = args.out || "data/stationary-sessions-7d.csv";

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function istDateOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtIst(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() || [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) {
    const raw = res.headers.get("set-cookie");
    if (!raw) throw new Error("No session cookie from login");
    return raw.split(",").map((c) => c.trim().split(";")[0]).join("; ");
  }
  return cookie;
}

async function fetchDay(cookie, date) {
  const res = await fetch(`${BASE}/api/admin/attendance?date=${date}`, {
    headers: { Cookie: cookie },
  });
  if (!res.ok) throw new Error(`Attendance ${date}: ${res.status}`);
  const data = await res.json();
  return data.records || [];
}

async function main() {
  console.log(`Base: ${BASE} | Days: ${DAYS} | Max stationary: ${MAX_M}m`);
  const cookie = await login();
  console.log("Logged in as admin.");

  const dates = [];
  for (let i = 0; i < DAYS; i++) dates.push(istDateOffset(i));

  const all = [];
  for (const date of dates) {
    const records = await fetchDay(cookie, date);
    const completed = records.filter((r) => r.punchOutAt);
    console.log(`${date}: ${records.length} sessions, ${completed.length} completed`);
    for (const r of completed) {
      const inOutGapM =
        r.punchOutLat != null && r.punchOutLng != null
          ? haversineMeters(
              { lat: r.punchInLat, lng: r.punchInLng },
              { lat: r.punchOutLat, lng: r.punchOutLng }
            )
          : null;
      const travelM = Math.round(r.distanceMeters ?? 0);
      const gapM = inOutGapM != null ? Math.round(inOutGapM) : null;
      const sameLocation =
        travelM <= MAX_M && (gapM == null || gapM <= MAX_M);

      if (!sameLocation) continue;

      const punchIn = new Date(r.punchInAt);
      const punchOut = new Date(r.punchOutAt);
      const durationH = ((punchOut - punchIn) / 3600000).toFixed(1);

      all.push({
        date,
        name: r.name,
        phone: r.phone,
        designation: r.designation,
        assembly: r.assemblyName,
        sector: r.sectorAllotted,
        zone: r.zone,
        district: r.district,
        punchIn: fmtIst(r.punchInAt),
        punchOut: fmtIst(r.punchOutAt),
        durationH,
        travelM,
        inOutGapM: gapM ?? "",
        trackPoints: r.marks ?? 0,
        punchOutReason: r.punchOutReason ?? "manual",
        punchInLat: r.punchInLat,
        punchInLng: r.punchInLng,
        punchOutLat: r.punchOutLat ?? "",
        punchOutLng: r.punchOutLng ?? "",
        attendanceId: r.id,
      });
    }
  }

  all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const headers = [
    "Date",
    "Name",
    "Phone",
    "Designation",
    "Assembly",
    "Sector",
    "Zone",
    "District",
    "Punch In",
    "Punch Out",
    "Hours",
    "Travel (m)",
    "In-Out gap (m)",
    "Track points",
    "Punch out reason",
    "Punch In Lat",
    "Punch In Lng",
    "Punch Out Lat",
    "Punch Out Lng",
    "Session ID",
  ];

  const csv = [
    headers.join(","),
    ...all.map((r) =>
      [
        r.date,
        r.name,
        r.phone,
        r.designation,
        r.assembly,
        r.sector,
        r.zone,
        r.district,
        r.punchIn,
        r.punchOut,
        r.durationH,
        r.travelM,
        r.inOutGapM,
        r.trackPoints,
        r.punchOutReason,
        r.punchInLat,
        r.punchInLng,
        r.punchOutLat,
        r.punchOutLng,
        r.attendanceId,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\r\n");

  writeFileSync(OUT, "\uFEFF" + csv, "utf8");
  console.log(`\nSame-location sessions (≤${MAX_M}m): ${all.length}`);
  console.log(`Written: ${OUT}`);

  if (all.length) {
    console.log("\n--- Preview (first 25) ---");
    for (const r of all.slice(0, 25)) {
      console.log(
        `${r.date} | ${r.name} | ${r.assembly} | ${r.durationH}h | travel ${r.travelM}m | gap ${r.inOutGapM}m`
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
