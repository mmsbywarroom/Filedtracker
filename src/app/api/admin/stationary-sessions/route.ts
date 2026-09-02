import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { haversineMeters, mapGpsSpreadFromFixes } from "@/lib/utils";

const DEFAULT_MAX_M = Number(process.env.GPS_STATIONARY_SESSION_M || 80);

function istDayStart(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${ymd}T00:00:00+05:30`);
}

function fmtIst(d: Date) {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
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

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(31, Math.max(1, Number(searchParams.get("days") || 7)));
  const maxM = Math.min(500, Math.max(10, Number(searchParams.get("maxM") || DEFAULT_MAX_M)));
  const format = searchParams.get("format") || "csv";

  const since = istDayStart(days);
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
      points: { select: { lat: true, lng: true }, orderBy: { recordedAt: "asc" } },
    },
  });

  const stationary = rows
    .map((r) => {
      const spreadM = sessionSpreadM(
        { lat: r.punchInLat, lng: r.punchInLng },
        r.punchOutLat != null && r.punchOutLng != null ? { lat: r.punchOutLat, lng: r.punchOutLng } : null,
        r.points
      );
      const inOutGapM =
        r.punchOutLat != null && r.punchOutLng != null
          ? haversineMeters(
              { lat: r.punchInLat, lng: r.punchInLng },
              { lat: r.punchOutLat, lng: r.punchOutLng }
            )
          : null;
      const durationH = r.punchOutAt ? (r.punchOutAt.getTime() - r.punchInAt.getTime()) / 3600000 : 0;
      const sameLocation =
        (r.distanceMeters ?? 0) <= maxM && spreadM <= maxM && (inOutGapM == null || inOutGapM <= maxM);

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
        punchInOutGapM: inOutGapM != null ? Math.round(inOutGapM) : null,
        trackPoints: r.points.length,
        punchOutReason: r.punchOutReason ?? "manual",
        punchInLat: r.punchInLat,
        punchInLng: r.punchInLng,
        punchOutLat: r.punchOutLat,
        punchOutLng: r.punchOutLng,
        gpsMapSpreadM: r.gpsMapSpreadM != null ? Math.round(r.gpsMapSpreadM) : null,
        attendanceId: r.id,
      };
    })
    .filter((r) => r.sameLocation);

  if (format === "json") {
    return NextResponse.json({
      since: since.toISOString(),
      days,
      maxM,
      totalCompleted: rows.length,
      sameLocationCount: stationary.length,
      rows: stationary,
    });
  }

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
    "Map GPS spread (m)",
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
        r.gpsMapSpreadM,
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

  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="same-location-sessions-${days}d-${ymd}.csv"`,
    },
  });
}
