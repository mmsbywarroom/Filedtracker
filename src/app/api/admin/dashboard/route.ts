import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userScopeWhere } from "@/lib/hierarchy";

function groupCounts(
  users: { id: string; key: string }[],
  activeIds: Set<string>,
  liveIds: Set<string>
) {
  const map = new Map<string, { name: string; users: number; active: number; live: number }>();
  for (const u of users) {
    const name = u.key || "—";
    const row = map.get(name) || { name, users: 0, active: 0, live: 0 };
    row.users += 1;
    if (activeIds.has(u.id)) row.active += 1;
    if (liveIds.has(u.id)) row.live += 1;
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
    },
  });

  const punches = users.length
    ? await prisma.attendance.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          punchInAt: { gte: start, lte: end },
        },
        select: { userId: true, punchOutAt: true },
      })
    : [];

  const activeIds = new Set(punches.map((p) => p.userId));
  const liveIds = new Set(punches.filter((p) => !p.punchOutAt).map((p) => p.userId));

  return NextResponse.json({
    date,
    totalUsers: users.length,
    activeToday: activeIds.size,
    liveNow: liveIds.size,
    punches: punches.length,
    byDesignation: groupCounts(
      users.map((u) => ({ id: u.id, key: u.designation })),
      activeIds,
      liveIds
    ),
    byZone: groupCounts(
      users.map((u) => ({ id: u.id, key: u.zone })),
      activeIds,
      liveIds
    ),
    byDistrict: groupCounts(
      users.map((u) => ({ id: u.id, key: u.district })),
      activeIds,
      liveIds
    ),
    byAssembly: groupCounts(
      users.map((u) => ({ id: u.id, key: u.assemblyName })),
      activeIds,
      liveIds
    ),
    byCluster: groupCounts(
      users.map((u) => ({ id: u.id, key: u.cluster })),
      activeIds,
      liveIds
    ),
  });
}
