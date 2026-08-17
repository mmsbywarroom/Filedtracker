import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || "";
  const to = searchParams.get("to") || "";
  const status = searchParams.get("status") || "";

  const where: {
    userId: string;
    punchInAt?: { gte?: Date; lte?: Date };
    punchOutAt?: null | { not: null };
  } = { userId: s.sub };

  if (from || to) {
    where.punchInAt = {};
    if (from) where.punchInAt.gte = new Date(`${from}T00:00:00+05:30`);
    if (to) where.punchInAt.lte = new Date(`${to}T23:59:59.999+05:30`);
  }
  if (status === "live") where.punchOutAt = null;
  if (status === "done") where.punchOutAt = { not: null };

  const rows = await prisma.attendance.findMany({
    where,
    orderBy: { punchInAt: "desc" },
    take: 80,
    select: {
      id: true,
      punchInAt: true,
      punchOutAt: true,
      punchInLat: true,
      punchInLng: true,
      punchOutLat: true,
      punchOutLng: true,
      punchInAddress: true,
      punchOutAddress: true,
      distanceMeters: true,
      _count: { select: { points: true } },
    },
  });

  return NextResponse.json({
    records: rows.map((r) => ({
      id: r.id,
      punchInAt: r.punchInAt,
      punchOutAt: r.punchOutAt,
      punchInLat: r.punchInLat,
      punchInLng: r.punchInLng,
      punchOutLat: r.punchOutLat,
      punchOutLng: r.punchOutLng,
      punchInAddress: r.punchInAddress,
      punchOutAddress: r.punchOutAddress,
      distanceMeters: r.distanceMeters,
      marks: r._count.points,
      status: r.punchOutAt ? "done" : "live",
    })),
  });
}
