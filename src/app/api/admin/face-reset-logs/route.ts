import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/hierarchy";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "";
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const where: {
    createdAt?: { gte: Date; lte: Date };
  } = {};

  if (date) {
    where.createdAt = {
      gte: new Date(`${date}T00:00:00+05:30`),
      lte: new Date(`${date}T23:59:59.999+05:30`),
    };
  }

  const rows = await prisma.faceResetLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 2000,
  });

  const logs = rows
    .filter((r) => {
      if (!q) return true;
      const hay = [r.userName, r.userPhone, r.adminName, r.adminEmail, r.reason, r.userDesignation].join(" ").toLowerCase();
      return hay.includes(q);
    })
    .map((r) => ({
      id: r.id,
      when: r.createdAt.toISOString(),
      userId: r.userId,
      userName: r.userName,
      userPhone: r.userPhone,
      userDesignation: r.userDesignation,
      adminId: r.adminId,
      adminName: r.adminName,
      adminEmail: r.adminEmail,
      adminAccessLevel: r.adminAccessLevel,
      reason: r.reason,
    }));

  return NextResponse.json({ logs, count: logs.length });
}
