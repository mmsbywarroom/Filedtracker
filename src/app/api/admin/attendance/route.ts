import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import { sessionTravelMeters } from "@/lib/utils";

/**
 * Fast daily list — no face image blobs (base64 faces made this endpoint multi‑MB / very slow).
 * Faces load on demand via /api/admin/attendance/[id]/faces
 */
export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(`${date}T23:59:59.999+05:30`);

  const records = await prisma.attendance.findMany({
    where: {
      punchInAt: { gte: start, lte: end },
      user: userScopeWhere(s.admin),
    },
    orderBy: { punchInAt: "desc" },
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
      punchOutReason: true,
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
          faceRegisteredAt: true,
        },
      },
    },
  });

  const visible = records.filter((r) => canSeeUser(s.admin, r.user));
  const ids = visible.map((r) => r.id);

  const [pointCounts, faceFlags] = await Promise.all([
    ids.length
      ? prisma.trackPoint.groupBy({
          by: ["attendanceId"],
          where: { attendanceId: { in: ids } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { attendanceId: string; _count: { _all: number } }[]),
    ids.length
      ? prisma
          .$queryRawUnsafe<{ id: string; has_in: boolean; has_out: boolean }[]>(
            `SELECT id,
               ("punchInFace" IS NOT NULL AND length("punchInFace") > 20) AS has_in,
               ("punchOutFace" IS NOT NULL AND length("punchOutFace") > 20) AS has_out
             FROM "Attendance"
             WHERE id = ANY($1::text[])`,
            ids
          )
          .catch(() => [] as { id: string; has_in: boolean; has_out: boolean }[])
      : Promise.resolve([] as { id: string; has_in: boolean; has_out: boolean }[]),
  ]);

  const marksById = new Map(pointCounts.map((c) => [c.attendanceId, c._count._all]));
  const flagMap = new Map(faceFlags.map((f) => [f.id, { hasIn: Boolean(f.has_in), hasOut: Boolean(f.has_out) }]));

  return NextResponse.json({
    date,
    records: visible.map((r) => {
      const flags = flagMap.get(r.id);
      return {
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
        faceRegistered: Boolean(r.user.faceRegisteredAt),
        hasPunchInFace: flagMap.size ? Boolean(flags?.hasIn) : true,
        hasPunchOutFace: flagMap.size ? Boolean(flags?.hasOut) : Boolean(r.punchOutAt),
        punchInAt: r.punchInAt,
        punchOutAt: r.punchOutAt,
        punchInAddress: r.punchInAddress,
        punchOutAddress: r.punchOutAddress,
        distanceMeters: sessionTravelMeters({
          stored: r.distanceMeters,
          punchIn: { lat: r.punchInLat, lng: r.punchInLng },
          punchOut:
            r.punchOutLat != null && r.punchOutLng != null
              ? { lat: r.punchOutLat, lng: r.punchOutLng }
              : null,
        }),
        marks: marksById.get(r.id) || 0,
        status: r.punchOutAt ? "Completed" : "Live",
        punchOutReason: r.punchOutReason,
      };
    }),
  });
}
