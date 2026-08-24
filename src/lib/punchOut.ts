import { prisma } from "@/lib/prisma";
import { pathDistance } from "@/lib/utils";

export const AUTO_PUNCH_OUT_MS = 12 * 60 * 60 * 1000;

export type PunchOutReason = "manual" | "gps_off" | "auto_12h" | "auto_geofence";

export async function closeOpenAttendance(opts: {
  userId: string;
  lat: number;
  lng: number;
  address?: string | null;
  accuracy?: number | null;
  reason: PunchOutReason;
  punchOutFace?: string | null;
  /** When set (e.g. auto 12h), use this instead of now */
  punchOutAt?: Date;
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

  const punchOutAt = opts.punchOutAt || new Date();
  let address = opts.address;
  if (opts.reason === "gps_off") address = opts.address || "GPS turned off";
  if (opts.reason === "auto_12h") {
    address = opts.address || "Auto punch-out after 12 hours without punch-out";
  }
  if (opts.reason === "auto_geofence") {
    address = opts.address || "Auto punch-out: left Call Center 500 m boundary";
  }

  return prisma.attendance.update({
    where: { id: open.id },
    data: {
      punchOutAt,
      punchOutLat: lat,
      punchOutLng: lng,
      punchOutAddress: address,
      punchOutReason: opts.reason,
      punchOutFace: opts.punchOutFace || undefined,
      distanceMeters: distance,
      points: {
        create: { lat, lng, recordedAt: punchOutAt, accuracy: opts.accuracy ?? null },
      },
    },
    select: {
      id: true,
      userId: true,
      punchInAt: true,
      punchOutAt: true,
      distanceMeters: true,
      punchOutReason: true,
      punchOutLat: true,
      punchOutLng: true,
      punchOutAddress: true,
    },
  });
}

/** Close one open session if punch-in is older than 12 hours. */
export async function autoPunchOutIfStale(userId: string) {
  const open = await prisma.attendance.findFirst({
    where: { userId, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "desc" }, take: 1 } },
  });
  if (!open) return null;
  const deadline = new Date(open.punchInAt.getTime() + AUTO_PUNCH_OUT_MS);
  if (Date.now() < deadline.getTime()) return null;

  const last = open.points[0];
  return closeOpenAttendance({
    userId,
    lat: last?.lat ?? open.punchInLat,
    lng: last?.lng ?? open.punchInLng,
    accuracy: last?.accuracy ?? null,
    reason: "auto_12h",
    punchOutAt: deadline,
    address: "Auto punch-out after 12 hours without punch-out",
  });
}

/** Batch: close all open sessions past 12 hours. Returns count closed. */
export async function autoPunchOutAllStale(limit = 200) {
  const cutoff = new Date(Date.now() - AUTO_PUNCH_OUT_MS);
  const stale = await prisma.attendance.findMany({
    where: { punchOutAt: null, punchInAt: { lte: cutoff } },
    include: { points: { orderBy: { recordedAt: "desc" }, take: 1 } },
    take: limit,
    orderBy: { punchInAt: "asc" },
  });

  const closed = [];
  for (const row of stale) {
    try {
      const deadline = new Date(row.punchInAt.getTime() + AUTO_PUNCH_OUT_MS);
      const last = row.points[0];
      const result = await closeOpenAttendance({
        userId: row.userId,
        lat: last?.lat ?? row.punchInLat,
        lng: last?.lng ?? row.punchInLng,
        accuracy: last?.accuracy ?? null,
        reason: "auto_12h",
        punchOutAt: deadline,
        address: "Auto punch-out after 12 hours without punch-out",
      });
      if (result) closed.push(result);
    } catch (e) {
      console.error("[auto-punch-out] failed for", row.id, e);
    }
  }
  return closed;
}
