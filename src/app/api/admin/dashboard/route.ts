import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userScopeWhere } from "@/lib/hierarchy";

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

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const designation = searchParams.get("designation") || "";
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);

  const where = {
    ...userScopeWhere(s.admin),
    ...(designation ? { designation } : {}),
  };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      designation: true,
      zone: true,
      district: true,
      assemblyName: true,
      cluster: true,
      isActive: true,
    },
  });

  const punches = users.length
    ? await prisma.attendance.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          punchInAt: { gte: start, lte: end },
        },
        select: { userId: true, punchOutAt: true, distanceMeters: true },
      })
    : [];

  const punchedIds = new Set(punches.map((p) => p.userId));
  const liveIds = new Set(punches.filter((p) => !p.punchOutAt).map((p) => p.userId));
  const distByUser = new Map<string, number>();
  let totalDistance = 0;
  for (const p of punches) {
    const add = p.distanceMeters || 0;
    totalDistance += add;
    distByUser.set(p.userId, (distByUser.get(p.userId) || 0) + add);
  }
  const activeUsers = users.filter((u) => u.isActive).length;

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
}
