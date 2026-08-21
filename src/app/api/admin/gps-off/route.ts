import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextLevelScopeWhere } from "@/lib/hierarchy";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "";
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const scoped = await prisma.user.findMany({
    where: nextLevelScopeWhere(s.admin),
    select: { id: true },
  });
  const ids = scoped.map((u) => u.id);
  if (!ids.length) return NextResponse.json({ logs: [] });

  const where: Record<string, unknown> = {
    userId: { in: ids },
    punchOutReason: "gps_off",
  };
  if (date) {
    const start = new Date(`${date}T00:00:00+05:30`);
    const end = new Date(`${date}T23:59:59.999+05:30`);
    where.punchOutAt = { gte: start, lte: end };
  }

  const rows = await prisma.attendance.findMany({
    where,
    orderBy: { punchOutAt: "desc" },
    take: 500,
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
    },
  });

  const logs = rows
    .filter((r) => {
      if (!q) return true;
      const text = [r.user.name, r.user.phone, r.user.assemblyName, r.user.zone, r.user.district, r.punchOutAddress]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    })
    .map((r) => ({
      id: r.id,
      userId: r.user.id,
      name: r.user.name,
      phone: r.user.phone,
      designation: r.user.designation,
      assemblyName: r.user.assemblyName,
      sectorAllotted: r.user.sectorAllotted,
      zone: r.user.zone,
      district: r.user.district,
      punchInAt: r.punchInAt,
      punchOutAt: r.punchOutAt,
      lat: r.punchOutLat,
      lng: r.punchOutLng,
      place: r.punchOutAddress || "Last known GPS before GPS was turned off",
      reason: r.punchOutReason,
    }));

  return NextResponse.json({ logs });
}
