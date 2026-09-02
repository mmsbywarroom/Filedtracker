import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import {
  aggregateUniqueStationaryUsers,
  isExactSamePunchInOut,
  isSameLocationSession,
  punchInOutGapM,
  sessionSpreadM,
  type StationarySessionRow,
} from "@/lib/stationarySessions";

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

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.min(31, Math.max(1, Number(searchParams.get("days") || 7)));
  const maxM = Math.min(500, Math.max(10, Number(searchParams.get("maxM") || DEFAULT_MAX_M)));
  const format = searchParams.get("format") || "csv";
  const exact = searchParams.get("exact") === "1";
  const unique = searchParams.get("unique") !== "0" && searchParams.get("sessions") !== "1";

  const since = istDayStart(days);
  const scopedUsers = await prisma.user.findMany({
    where: userScopeWhere(s.admin),
    select: { id: true, name: true, phone: true, designation: true, assemblyName: true, sectorAllotted: true, zone: true, district: true },
  });
  const visibleUsers = scopedUsers.filter((u) => canSeeUser(s.admin, u));
  const userIds = visibleUsers.map((u) => u.id);
  if (!userIds.length) {
    if (format === "json") {
      return NextResponse.json({ since: since.toISOString(), days, exact, rows: [], uniqueUsers: 0, sameLocationSessions: 0 });
    }
    return new NextResponse("\uFEFF" + "No users in scope.", {
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  }

  const rows = await prisma.attendance.findMany({
    where: {
      userId: { in: userIds },
      punchInAt: { gte: since },
      punchOutAt: { not: null },
    },
    orderBy: { punchInAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
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

  const sessions: StationarySessionRow[] = rows.map((r) => {
    const spreadM = sessionSpreadM(
      { lat: r.punchInLat, lng: r.punchInLng },
      r.punchOutLat != null && r.punchOutLng != null ? { lat: r.punchOutLat, lng: r.punchOutLng } : null,
      r.points
    );
    const inOutGapM = punchInOutGapM(r);
    const durationH = r.punchOutAt ? (r.punchOutAt.getTime() - r.punchInAt.getTime()) / 3600000 : 0;
    const exactSame = isExactSamePunchInOut(r);
    const sameLocation = exact
      ? exactSame
      : isSameLocationSession({
          distanceMeters: r.distanceMeters ?? 0,
          spreadM,
          inOutGapM,
          maxM,
        });

    return {
      sameLocation,
      userId: r.user.id,
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
  });

  const stationary = sessions.filter((r) => r.sameLocation);
  const uniqueUsers = aggregateUniqueStationaryUsers(sessions);

  if (format === "json") {
    return NextResponse.json({
      since: since.toISOString(),
      days,
      maxM,
      exact,
      unique,
      totalCompleted: rows.length,
      sameLocationSessions: stationary.length,
      uniqueUsers: uniqueUsers.length,
      rows: unique ? uniqueUsers : stationary,
    });
  }

  if (unique) {
    const headers = exact
      ? [
          "Name",
          "Phone",
          "Designation",
          "Assembly",
          "Sector",
          "Zone",
          "District",
          "Same in/out sessions",
          "Days",
          `Same in/out dates (last ${days} days)`,
          "Latitude",
          "Longitude",
          "Total hours",
          "Max hours (one day)",
          "Last date",
          "Last punch in",
          "Last punch out",
        ]
      : [
          "Name",
          "Phone",
          "Designation",
          "Assembly",
          "Sector",
          "Zone",
          "District",
          "Same-location sessions",
          "Days",
          `Same-location dates (last ${days} days)`,
          "Total hours",
          "Max hours (one day)",
          "Avg travel (m)",
          "Max map spread (m)",
          "Last date",
          "Last punch in",
          "Last punch out",
        ];

    const csv = [
      headers.join(","),
      ...uniqueUsers.map((r) => {
        const lastSession = stationary
          .filter((s) => s.userId === r.userId)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        const base = [
          r.name,
          r.phone,
          r.designation,
          r.assembly,
          r.sector,
          r.zone,
          r.district,
          r.sessions,
          r.days,
          r.sameLocationDates,
        ];
        if (exact) {
          base.push(
            lastSession?.punchInLat ?? "",
            lastSession?.punchInLng ?? "",
            r.totalHours,
            r.maxHours,
            r.lastDate,
            r.lastPunchIn,
            r.lastPunchOut
          );
        } else {
          base.push(r.totalHours, r.maxHours, r.avgTravelM, r.maxMapSpreadM, r.lastDate, r.lastPunchIn, r.lastPunchOut);
        }
        return base.map(csvEscape).join(",");
      }),
    ].join("\r\n");

    const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const fname = exact ? `same-in-out-coords-users-${days}d-${ymd}.csv` : `same-location-users-${days}d-${ymd}.csv`;
    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fname}"`,
      },
    });
  }

  const headers = exact
    ? [
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
        "Latitude",
        "Longitude",
        "In-Out gap (m)",
        "Travel (m)",
        "Punch out reason",
        "Session ID",
      ]
    : [
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
    ...stationary.map((r) => {
      const base = [
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
      ];
      if (exact) {
        base.push(r.punchInLat, r.punchInLng, r.punchInOutGapM ?? 0, r.travelM, r.punchOutReason, r.attendanceId);
      } else {
        base.push(
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
          r.attendanceId
        );
      }
      return base.map(csvEscape).join(",");
    }),
  ].join("\r\n");

  const ymd = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fname = exact ? `same-in-out-coords-sessions-${days}d-${ymd}.csv` : `same-location-sessions-${days}d-${ymd}.csv`;
  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
