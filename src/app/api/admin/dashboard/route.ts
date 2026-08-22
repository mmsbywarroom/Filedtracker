import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userScopeWhere } from "@/lib/hierarchy";
import { formatKm } from "@/lib/utils";

function groupCounts(
  users: { id: string; key: string; isActive: boolean }[],
  punchedIds: Set<string>,
  liveIds: Set<string>,
  distByUser: Map<string, number>
) {
  const map = new Map<
    string,
    { name: string; users: number; active: number; inactive: number; punched: number; live: number; distance: number }
  >();
  for (const u of users) {
    const name = u.key || "—";
    const row = map.get(name) || { name, users: 0, active: 0, inactive: 0, punched: 0, live: 0, distance: 0 };
    row.users += 1;
    if (u.isActive) row.active += 1;
    else row.inactive += 1;
    if (punchedIds.has(u.id)) row.punched += 1;
    if (liveIds.has(u.id)) row.live += 1;
    row.distance += distByUser.get(u.id) || 0;
    map.set(name, row);
  }
  return Array.from(map.values()).sort((a, b) => b.users - a.users);
}

const METRICS = new Set(["total", "active", "inactive", "live", "punched", "distance"]);
const GROUP_BY = new Set(["designation", "zone", "district", "assembly", "cluster"]);
const GROUP_FIELD: Record<string, "designation" | "zone" | "district" | "assemblyName" | "cluster"> = {
  designation: "designation",
  zone: "zone",
  district: "district",
  assembly: "assemblyName",
  cluster: "cluster",
};

function matchesGroupValue(raw: string | null | undefined, groupValue: string) {
  const val = raw || "";
  if (groupValue === "—") return !val;
  return val === groupValue;
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
    const start = new Date(`${date}T00:00:00+05:30`);
    const end = new Date(`${date}T23:59:59.999+05:30`);

    const userWhere = {
      ...userScopeWhere(s.admin),
      ...(designation ? { designation } : {}),
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
      },
    });

    const punches = await prisma.attendance.findMany({
      where: {
        punchInAt: { gte: start, lte: end },
        user: userWhere,
      },
      select: { userId: true, punchOutAt: true, distanceMeters: true, punchInAt: true },
    });

    const punchedIds = new Set(punches.map((p) => p.userId));
    const liveIds = new Set(punches.filter((p) => !p.punchOutAt).map((p) => p.userId));
    const distByUser = new Map<string, number>();
    const punchInByUser = new Map<string, Date>();
    let totalDistance = 0;
    for (const p of punches) {
      const add = p.distanceMeters || 0;
      totalDistance += add;
      distByUser.set(p.userId, (distByUser.get(p.userId) || 0) + add);
      if (!punchInByUser.has(p.userId)) punchInByUser.set(p.userId, p.punchInAt);
    }
    const activeUsers = users.filter((u) => u.isActive).length;

    if (metric && METRICS.has(metric)) {
      let filtered = users;
      if (metric === "active") filtered = users.filter((u) => u.isActive);
      else if (metric === "inactive") filtered = users.filter((u) => !u.isActive);
      else if (metric === "live") filtered = users.filter((u) => liveIds.has(u.id));
      else if (metric === "punched") filtered = users.filter((u) => punchedIds.has(u.id));
      else if (metric === "distance") filtered = users.filter((u) => (distByUser.get(u.id) || 0) > 0);

      if (groupBy && GROUP_BY.has(groupBy)) {
        const field = GROUP_FIELD[groupBy];
        if (field) filtered = filtered.filter((u) => matchesGroupValue(u[field], groupValue));
      }

      const rows = filtered
        .map((u) => ({
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
          punchedToday: punchedIds.has(u.id),
          liveNow: liveIds.has(u.id),
          distanceMeters: distByUser.get(u.id) || 0,
          distanceLabel: formatKm(distByUser.get(u.id) || 0),
          punchInAt: punchInByUser.get(u.id)?.toISOString() || null,
        }))
        .sort((a, b) => {
          if (metric === "distance") return b.distanceMeters - a.distanceMeters;
          return a.name.localeCompare(b.name);
        });

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
        users.map((u) => ({ id: u.id, key: u[key] || "", isActive: u.isActive })),
        punchedIds,
        liveIds,
        distByUser
      );

    return NextResponse.json({
      date,
      totalUsers: users.length,
      activeUsers,
      inactiveUsers: users.length - activeUsers,
      activeToday: punchedIds.size,
      liveNow: liveIds.size,
      punches: punches.length,
      totalDistance,
      byDesignation: grouped("designation"),
      byZone: grouped("zone"),
      byDistrict: grouped("district"),
      byAssembly: grouped("assemblyName"),
      byCluster: grouped("cluster"),
    });
  } catch (e) {
    console.error("dashboard error", e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
