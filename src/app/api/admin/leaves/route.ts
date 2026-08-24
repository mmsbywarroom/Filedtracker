import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reviewScopeWhere } from "@/lib/hierarchy";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "";
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const scoped = await prisma.user.findMany({
    where: reviewScopeWhere(s.admin),
    select: { id: true },
  });
  const ids = scoped.map((u) => u.id);
  if (!ids.length) return NextResponse.json({ leaves: [] });

  const where: Record<string, unknown> = { userId: { in: ids } };
  if (status && ["pending", "approved", "rejected"].includes(status)) where.status = status;

  const rows = await prisma.leaveRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 400,
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

  const leaves = rows
    .filter((r) => {
      if (!q) return true;
      const text = [r.user.name, r.user.phone, r.user.assemblyName, r.reason, r.user.zone].join(" ").toLowerCase();
      return text.includes(q);
    })
    .sort((a, b) => {
      const order = { pending: 0, approved: 1, rejected: 2 } as Record<string, number>;
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    })
    .map((r) => ({
      id: r.id,
      fromDate: r.fromDate,
      toDate: r.toDate,
      reason: r.reason,
      status: r.status,
      adminNote: r.adminNote,
      reviewedAt: r.reviewedAt,
      reviewedBy: r.reviewedBy,
      createdAt: r.createdAt,
      user: r.user,
    }));

  return NextResponse.json({ leaves });
}
