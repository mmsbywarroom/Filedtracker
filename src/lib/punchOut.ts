import { prisma } from "@/lib/prisma";
import { pathDistance } from "@/lib/utils";

export async function closeOpenAttendance(opts: {
  userId: string;
  lat: number;
  lng: number;
  address?: string | null;
  accuracy?: number | null;
  reason: "manual" | "gps_off";
  punchOutFace?: string | null;
}) {
  const open = await prisma.attendance.findFirst({
    where: { userId: opts.userId, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "asc" } } },
  });
  if (!open) return null;

  const lastPoint = open.points[open.points.length - 1];
  const lat = Number.isFinite(opts.lat) ? opts.lat : lastPoint?.lat ?? open.punchInLat;
  const lng = Number.isFinite(opts.lng) ? opts.lng : lastPoint?.lng ?? open.punchInLng;
  const distance = pathDistance([
    { lat: open.punchInLat, lng: open.punchInLng },
    ...open.points.map((p) => ({ lat: p.lat, lng: p.lng })),
    { lat, lng },
  ]);

  return prisma.attendance.update({
    where: { id: open.id },
    data: {
      punchOutAt: new Date(),
      punchOutLat: lat,
      punchOutLng: lng,
      punchOutAddress: opts.reason === "gps_off" ? opts.address || "GPS turned off" : opts.address,
      punchOutReason: opts.reason,
      punchOutFace: opts.punchOutFace || undefined,
      distanceMeters: distance,
      points: {
        create: { lat, lng, recordedAt: new Date(), accuracy: opts.accuracy ?? null },
      },
    },
    select: { id: true, punchOutAt: true, distanceMeters: true, punchOutReason: true, punchOutLat: true, punchOutLng: true },
  });
}
