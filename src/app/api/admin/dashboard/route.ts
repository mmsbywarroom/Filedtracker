import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeCallCenterUsers, userScopeWhere, visibleDesignationsFor } from "@/lib/hierarchy";
import { CALL_CENTER_SITE_NAMES, callCenterSiteName } from "@/lib/callCenterGeofence";
import { istDayBounds } from "@/lib/dailyAttendance";

function groupCounts(
  users: { id: string; key: string; isActive: boolean; faceRegistered: boolean }[],
  punchedIds: Set<string>,
  liveIds: Set<string>,
  leaveIds: Set<string>
) {
  const map = new Map<
    string,
    {
      name: string;
      users: number;
      active: number;
      inactive: number;
      faceRegistered: number;
      punched: number;
      live: number;
      leave: number;
      pendingPunchIn: number;
      pendingFace: number;
      pendingLive: number;
    }
  >();
  for (const u of users) {
    const name = u.key || "—";
    const row = map.get(name) || {
      name,
      users: 0,
      active: 0,
      inactive: 0,
      faceRegistered: 0,
      punched: 0,
      live: 0,
      leave: 0,
      pendingPunchIn: 0,
      pendingFace: 0,
      pendingLive: 0,
    };
    row.users += 1;
    if (u.isActive) row.active += 1;
    else row.inactive += 1;
    if (u.faceRegistered) row.faceRegistered += 1;
    else if (u.isActive) row.pendingFace += 1;
    if (leaveIds.has(u.id)) row.leave += 1;
    if (punchedIds.has(u.id)) row.punched += 1;
    // Leave (Attendance mark) and inactive are excluded from pending punch-in
    else if (u.isActive && !leaveIds.has(u.id)) row.pendingPunchIn += 1;
    if (liveIds.has(u.id)) row.live += 1;
    else if (punchedIds.has(u.id)) row.pendingLive += 1;
    map.set(name, row);
  }
  return Array.from(map.values()).sort((a, b) => b.users - a.users);
}

const METRICS = new Set([
  "total",
  "active",
  "inactive",
  "face",
  "live",
  "punched",
  "leave",
  "pendingPunchIn",
  "pendingFace",
  "pendingLive",
]);
const GROUP_BY = new Set(["designation", "zone", "district", "assembly", "cluster", "callCenterSite"]);
const GROUP_FIELD: Record<string, "designation" | "zone" | "district" | "assemblyName" | "cluster" | "sectorAllotted"> = {
  designation: "designation",
  zone: "zone",
  district: "district",
  assembly: "assemblyName",
  cluster: "cluster",
  callCenterSite: "sectorAllotted",
};

function matchesGroupValue(raw: string | null | undefined, groupValue: string) {
  const val = raw || "";
  if (groupValue === "—") return !val;
  return val === groupValue;
}

function emptyGroup(name: string) {
  return {
    name,
    users: 0,
    active: 0,
    inactive: 0,
    faceRegistered: 0,
    punched: 0,
    live: 0,
    leave: 0,
    pendingPunchIn: 0,
    pendingFace: 0,
    pendingLive: 0,
  };
}

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const designation = searchParams.get("designation") || "";
    const metric = searchParams.get("metric") || "";
    const groupBy = searchParams.get("groupBy") || "";
    const groupValue = searchParams.get("groupValue") ?? "";
    const { start, end, dateOnly } = istDayBounds(date);

    const dashScope = searchParams.get("scope") === "callCenter" ? "callCenter" : "field";
    if (dashScope === "callCenter" && !canSeeCallCenterUsers(s.admin)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dens = visibleDesignationsFor(s.admin).filter((d) =>
      dashScope === "callCenter" ? d === "Call Center" : d !== "Call Center"
    );
    if (designation && !dens.includes(designation)) {
      return NextResponse.json({
        date,
        totalUsers: 0,
        activeUsers: 0,
        inactiveUsers: 0,
        faceRegisteredUsers: 0,
        activeToday: 0,
        liveNow: 0,
        leaveOnDate: 0,
        punches: 0,
        pendingPunchIn: 0,
        pendingFace: 0,
        pendingLive: 0,
        byDesignation: [],
        byZone: [],
        byDistrict: [],
        byAssembly: [],
        byCluster: [],
        byCallCenterSite: [],
        rows: [],
        count: 0,
      });
    }

    const userWhere = {
      AND: [
        userScopeWhere(s.admin),
        dashScope === "callCenter" ? { designation: "Call Center" } : { NOT: { designation: "Call Center" } },
        designation ? { designation } : {},
      ],
    };

    const users = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        phone: true,
        designation: true,
        zone: true,
        district: true,
        assemblyName: true,
        sectorAllotted: true,
        cluster: true,
        isActive: true,
        faceRegisteredAt: true,
      },
    });

    const userIds = users.map((u) => u.id);

    const [punches, leaveMarks] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          punchInAt: { gte: start, lte: end },
          user: userWhere,
        },
        select: {
          userId: true,
          punchOutAt: true,
          punchInAt: true,
          punchInAddress: true,
          punchOutReason: true,
          punchOutAddress: true,
        },
      }),
      userIds.length
        ? prisma.dailyAttendanceMark.findMany({
            where: {
              date: dateOnly,
              status: "leave",
              userId: { in: userIds },
            },
            select: { userId: true, note: true },
          })
        : Promise.resolve([]),
    ]);

    const punchedIds = new Set(punches.map((p) => p.userId));
    const liveIds = new Set(punches.filter((p) => !p.punchOutAt).map((p) => p.userId));
    const leaveIds = new Set(leaveMarks.map((m) => m.userId));
    const leaveNoteByUser = new Map(leaveMarks.map((m) => [m.userId, m.note || ""]));
    const punchInByUser = new Map<string, Date>();
    const punchMetaByUser = new Map<
      string,
      { punchInAddress: string | null; punchOutReason: string | null; punchOutAddress: string | null }
    >();
    for (const p of punches) {
      if (!punchInByUser.has(p.userId)) {
        punchInByUser.set(p.userId, p.punchInAt);
        punchMetaByUser.set(p.userId, {
          punchInAddress: p.punchInAddress,
          punchOutReason: p.punchOutReason,
          punchOutAddress: p.punchOutAddress,
        });
      }
    }

    const activeUsers = users.filter((u) => u.isActive).length;
    const faceRegisteredUsers = users.filter((u) => u.faceRegisteredAt).length;
    const leaveOnDate = users.filter((u) => leaveIds.has(u.id)).length;
    const pendingPunchIn = users.filter((u) => u.isActive && !punchedIds.has(u.id) && !leaveIds.has(u.id)).length;
    const pendingFace = users.filter((u) => u.isActive && !u.faceRegisteredAt).length;
    const pendingLive = users.filter((u) => punchedIds.has(u.id) && !liveIds.has(u.id)).length;

    if (metric && METRICS.has(metric)) {
      let filtered = users;
      if (metric === "active") filtered = users.filter((u) => u.isActive);
      else if (metric === "inactive") filtered = users.filter((u) => !u.isActive);
      else if (metric === "face") filtered = users.filter((u) => u.faceRegisteredAt);
      else if (metric === "live") filtered = users.filter((u) => liveIds.has(u.id));
      else if (metric === "punched") filtered = users.filter((u) => punchedIds.has(u.id));
      else if (metric === "leave") filtered = users.filter((u) => leaveIds.has(u.id));
      else if (metric === "pendingPunchIn") {
        filtered = users.filter((u) => u.isActive && !punchedIds.has(u.id) && !leaveIds.has(u.id));
      } else if (metric === "pendingFace") filtered = users.filter((u) => u.isActive && !u.faceRegisteredAt);
      else if (metric === "pendingLive") {
        filtered = users.filter((u) => punchedIds.has(u.id) && !liveIds.has(u.id));
      }

      if (groupBy && GROUP_BY.has(groupBy)) {
        if (groupBy === "callCenterSite") {
          filtered = filtered.filter((u) => callCenterSiteName(u.sectorAllotted) === groupValue);
        } else {
          const field = GROUP_FIELD[groupBy];
          if (field && field !== "sectorAllotted") filtered = filtered.filter((u) => matchesGroupValue(u[field], groupValue));
        }
      }

      const rows = filtered
        .map((u) => {
          const meta = punchMetaByUser.get(u.id);
          const onLeaveToday = leaveIds.has(u.id);
          return {
            id: u.id,
            name: u.name,
            phone: u.phone,
            designation: u.designation,
            assemblyName: u.assemblyName,
            sectorAllotted: u.sectorAllotted,
            zone: u.zone,
            district: u.district,
            cluster: u.cluster,
            isActive: u.isActive,
            faceRegistered: Boolean(u.faceRegisteredAt),
            faceRegisteredAt: u.faceRegisteredAt?.toISOString() || null,
            punchedToday: punchedIds.has(u.id),
            liveNow: liveIds.has(u.id),
            punchInAt: punchInByUser.get(u.id)?.toISOString() || null,
            punchInAddress: meta?.punchInAddress || null,
            punchOutReason: meta?.punchOutReason || null,
            punchOutAddress: meta?.punchOutAddress || null,
            onLeaveToday,
            leaveRemark: onLeaveToday ? leaveNoteByUser.get(u.id) || "Marked leave on Attendance" : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return NextResponse.json({
        date,
        metric,
        groupBy: groupBy && GROUP_BY.has(groupBy) ? groupBy : null,
        groupValue: groupBy && GROUP_BY.has(groupBy) ? groupValue : null,
        rows,
        count: rows.length,
      });
    }

    const grouped = (key: "designation" | "zone" | "district" | "assemblyName" | "cluster") =>
      groupCounts(
        users.map((u) => ({
          id: u.id,
          key: u[key] || "",
          isActive: u.isActive,
          faceRegistered: Boolean(u.faceRegisteredAt),
        })),
        punchedIds,
        liveIds,
        leaveIds
      );

    const byCallCenterSite = CALL_CENTER_SITE_NAMES.map((site) => {
      const siteUsers = users.filter((u) => callCenterSiteName(u.sectorAllotted) === site);
      const row = groupCounts(
        siteUsers.map((u) => ({
          id: u.id,
          key: site,
          isActive: u.isActive,
          faceRegistered: Boolean(u.faceRegisteredAt),
        })),
        punchedIds,
        liveIds,
        leaveIds
      )[0];
      return row || emptyGroup(site);
    });

    return NextResponse.json({
      date,
      totalUsers: users.length,
      activeUsers,
      inactiveUsers: users.length - activeUsers,
      faceRegisteredUsers,
      activeToday: punchedIds.size,
      liveNow: liveIds.size,
      leaveOnDate,
      punches: punches.length,
      pendingPunchIn,
      pendingFace,
      pendingLive,
      byDesignation: grouped("designation"),
      byZone: grouped("zone"),
      byDistrict: grouped("district"),
      byAssembly: grouped("assemblyName"),
      byCluster: grouped("cluster"),
      byCallCenterSite,
    });
  } catch (e) {
    console.error("dashboard error", e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
