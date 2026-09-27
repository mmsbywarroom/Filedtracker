import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userScopeWhere } from "@/lib/hierarchy";
import { istDayBounds } from "@/lib/dailyAttendance";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = (searchParams.get("date") || "").trim();
  const level = (searchParams.get("level") || "").trim();
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const where = {
    AND: [
      { user: userScopeWhere(s.admin) },
      date ? { date: istDayBounds(date).dateOnly } : {},
      level === "DLC" || level === "Cluster" ? { changedByLevel: level } : {},
    ],
  };

  const rows = await prisma.attendanceDirectChange.findMany({
    where,
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
          cluster: true,
        },
      },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });

  const filtered = q
    ? rows.filter((r) => {
        const blob = `${r.user.name} ${r.user.phone} ${r.user.designation} ${r.user.assemblyName} ${r.user.sectorAllotted} ${r.changedByName} ${r.note}`.toLowerCase();
        return blob.includes(q);
      })
    : rows;

  const byCluster = filtered.filter((r) => r.changedByLevel === "Cluster").length;
  const byDlc = filtered.filter((r) => r.changedByLevel === "DLC").length;

  return NextResponse.json({
    summary: {
      total: filtered.length,
      byCluster,
      byDlc,
    },
    rows: filtered,
  });
}
