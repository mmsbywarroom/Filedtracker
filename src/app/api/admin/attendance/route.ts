import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);

  const records = await prisma.attendance.findMany({
    where: { punchInAt: { gte: start, lt: end } },
    orderBy: { punchInAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          assemblyName: true,
          sectorAllotted: true,
          zone: true,
          district: true,
          faceImage: true,
        },
      },
      _count: { select: { points: true } },
    },
  });

  return NextResponse.json({
    date,
    records: records.map((r) => ({
      id: r.id,
      userId: r.user.id,
      name: r.user.name,
      phone: r.user.phone,
      assemblyName: r.user.assemblyName,
      sectorAllotted: r.user.sectorAllotted,
      zone: r.user.zone,
      district: r.user.district,
      faceImage: r.user.faceImage,
      punchInFace: r.punchInFace,
      punchOutFace: r.punchOutFace,
      punchInAt: r.punchInAt,
      punchOutAt: r.punchOutAt,
      punchInAddress: r.punchInAddress,
      punchOutAddress: r.punchOutAddress,
      distanceMeters: r.distanceMeters,
      marks: r._count.points,
      status: r.punchOutAt ? "Completed" : "Live",
    })),
  });
}
