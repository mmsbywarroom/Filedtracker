/**
 * Last 7 days (IST): users who punched in AND out while staying at one location.
 * Usage: npx tsx scripts/stationary-sessions-7d.ts [--max-m=80] [--out=file.csv]
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import { haversineMeters, mapGpsSpreadFromFixes } from "../src/lib/utils";

const prisma = new PrismaClient();

const MAX_STATIONARY_M = Number(process.argv.find((a) => a.startsWith("--max-m="))?.split("=")[1] || 80);
const OUT = process.argv.find((a) => a.startsWith("--out="))?.split("=")[1];

function istDayStart(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${ymd}T00:00:00+05:30`);
}

function fmtIst(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function csvEscape(v: string | number) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sessionSpreadM(
  punchIn: { lat: number; lng: number },
  punchOut: { lat: number; lng: number } | null,
  points: { lat: number; lng: number }[]
) {
  const fixes = [{ lat: punchIn.lat, lng: punchIn.lng }, ...points];
  if (punchOut) fixes.push(punchOut);
  return mapGpsSpreadFromFixes(fixes);
}

function punchInOutGapM(a: { punchInLat: number; punchInLng: number; punchOutLat: number | null; punchOutLng: number | null }) {
  if (a.punchOutLat == null || a.punchOutLng == null) return null;
  return haversineMeters({ lat: a.punchInLat, lng: a.punchInLng }, { lat: a.punchOutLat, lng: a.punchOutLng });
}

async function main() {
  const since = istDayStart(7);
  const rows = await prisma.attendance.findMany({
    where: {
      punchInAt: { gte: since },
      punchOutAt: { not: null },
    },
    orderBy: { punchInAt: "desc" },
    include: {
      user: {
        select: {
          name: true,
          phone: true,
          designation: true,
          assemblyName: true,
          sectorAllotted: true,
          zone: true,
          district: true,
        },
      },
      points: { select: { lat: true, lng: true, recordedAt: true }, orderBy: { recordedAt: "asc" } },
    },
  });

  const stationary = rows
    .map((r) => {
      const spreadM = sessionSpreadM(
        { lat: r.punchInLat, lng: r.punchInLng },
        r.punchOutLat != null && r.punchOutLng != null ? { lat: r.punchOutLat, lng: r.punchOutLng } : null,
        r.points
      );
      const inOutGapM = punchInOutGapM(r);
      const durationH =
        r.punchOutAt && r.punchInAt
          ? (r.punchOutAt.getTime() - r.punchInAt.getTime()) / 3600000
          : 0;
      const sameLocation =
        (r.distanceMeters ?? 0) <= MAX_STATIONARY_M &&
        spreadM <= MAX_STATIONARY_M &&
        (inOutGapM == null || inOutGapM <= MAX_STATIONARY_M);

      return {
        sameLocation,
        date: r.punchInAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        name: r.user.name,
        phone: r.user.phone,
        designation: r.user.designation,
        assembly: r.user.assemblyName,
        sector: r.user.sectorAllotted,
        zone: r.user.zone,
        district: r.user.district,
        punchIn: fmtIst(r.punchInAt),
        punchOut: r.punchOutAt ? fmtIst(r.punchOutAt) : "",
        durationH: durationH.toFixed(1),
        travelM: Math.round(r.distanceMeters ?? 0),
        mapSpreadM: Math.round(spreadM),
        punchInOutGapM: inOutGapM != null ? Math.round(inOutGapM) : "",
        punchInLat: r.punchInLat,
        punchInLng: r.punchInLng,
        punchOutLat: r.punchOutLat ?? "",
        punchOutLng: r.punchOutLng ?? "",
        trackPoints: r.points.length,
        punchOutReason: r.punchOutReason ?? "manual",
        attendanceId: r.id,
      };
    })
    .filter((r) => r.sameLocation);

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
    "Map spread (m)",
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
    ...stationary.map((r) =>
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
        r.mapSpreadM,
        r.punchInOutGapM,
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

  const outPath = OUT || "data/stationary-sessions-7d.csv";
  writeFileSync(outPath, "\uFEFF" + csv, "utf8");

  console.log(`Since (IST): ${fmtIst(since)}`);
  console.log(`Total completed sessions (7d): ${rows.length}`);
  console.log(`Same-location sessions (≤${MAX_STATIONARY_M}m): ${stationary.length}`);
  console.log(`Written: ${outPath}`);

  if (stationary.length <= 30) {
    console.log("\n--- Preview ---");
    for (const r of stationary) {
      console.log(
        `${r.date} | ${r.name} (${r.phone}) | ${r.assembly} | ${r.durationH}h | travel ${r.travelM}m | spread ${r.mapSpreadM}m`
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
