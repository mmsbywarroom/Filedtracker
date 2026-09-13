import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { attendanceChangeListWhere } from "@/lib/attendanceChangeApproval";
import { normalizeAccessLevel, isSuperAdmin } from "@/lib/hierarchy";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") || "pending").trim();
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const level = normalizeAccessLevel(s.admin.accessLevel);
  const canDecide =
    isSuperAdmin(s.admin) || level === "State" || level === "DLC" || level === "ZLC";

  const scopeWhere = attendanceChangeListWhere(s.admin);
  const rows = await prisma.attendanceChangeRequest.findMany({
    where: {
      AND: [
        scopeWhere,
        status && status !== "all" ? { status } : {},
      ],
    },
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
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const filtered = q
    ? rows.filter((r) => {
        const blob = `${r.user.name} ${r.user.phone} ${r.user.assemblyName} ${r.requestedByName} ${r.note}`.toLowerCase();
        return blob.includes(q);
      })
    : rows;

  return NextResponse.json({
    requests: filtered,
    canDecide,
    reviewLevelHint:
      level === "DLC" ? "DLC" : level === "ZLC" ? "ZLC" : isSuperAdmin(s.admin) || level === "State" ? "all" : null,
  });
}
