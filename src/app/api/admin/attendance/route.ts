import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import { haversineMeters } from "@/lib/utils";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);
  const scopedUsers = await prisma.user.findMany({
    where: userScopeWhere(s.admin),
    select: { id: true },
  });
  const ids = scopedUsers.map((u) => u.id);
  if (!ids.length) return NextResponse.json({ date, records: [] });

  const records = await prisma.attendance.findMany({
    where: { punchInAt: { gte: start, lt: end }, userId: { in: ids } },
    orderBy: { punchInAt: "desc" },
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
          cluster: true,
          faceImage: true,
        },
      },
      _count: { select: { points: true } },
    },
  });

  return NextResponse.json({
    date,
    records: records.filter((r) => canSeeUser(s.admin, r.user)).map((r) => ({
      id: r.id,
      userId: r.user.id,
      name: r.user.name,
      phone: r.user.phone,
      designation: r.user.designation,
      assemblyName: r.user.assemblyName,
      sectorAllotted: r.user.sectorAllotted,
      zone: r.user.zone,
      district: r.user.district,
      cluster: r.user.cluster,
      faceImage: r.user.faceImage,
      punchInFace: r.punchInFace,
      punchOutFace: r.punchOutFace,
      punchInAt: r.punchInAt,
      punchOutAt: r.punchOutAt,
      punchInAddress: r.punchInAddress,
      punchOutAddress: r.punchOutAddress,
      distanceMeters:
        r.distanceMeters > 1
          ? r.distanceMeters
          : r.punchOutLat != null && r.punchOutLng != null
            ? haversineMeters(
                { lat: r.punchInLat, lng: r.punchInLng },
                { lat: r.punchOutLat, lng: r.punchOutLng }
              )
            : r.distanceMeters,
      marks: r._count.points,
      status: r.punchOutAt ? "Completed" : "Live",
    })),
  });
}
