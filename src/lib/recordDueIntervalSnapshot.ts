import { prisma } from "@/lib/prisma";
import {
  isSlotDueNow,
  isValidIntervalSnapshot,
  MAX_INTERVAL_SLOTS,
  slotDueAtMs,
} from "@/lib/attendanceIntervalFlag";

const MIN_GAP_BETWEEN_SLOTS_MS = 8 * 60 * 1000;

/**
 * If a native open session is inside a 30-min FLAG window and that slot is missing,
 * record lat/lng now. Used by /interval-snapshot and by /track so heartbeats fill gaps
 * when the dedicated interval POST is delayed.
 */
export async function maybeRecordDueIntervalSnapshot(opts: {
  attendanceId: string;
  punchInAt: Date;
  punchInClient: string | null | undefined;
  lat: number;
  lng: number;
  now?: Date;
  /** When set, only this slot is considered (explicit interval POST). */
  preferredSlot?: number;
}): Promise<{ slot: number; alreadyRecorded?: boolean } | null> {
  if (opts.punchInClient !== "native") return null;
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) return null;

  const now = opts.now ?? new Date();
  const nowMs = now.getTime();

  const slots: number[] = [];
  if (opts.preferredSlot != null) {
    slots.push(opts.preferredSlot);
  } else {
    for (let slot = 1; slot <= MAX_INTERVAL_SLOTS; slot++) slots.push(slot);
  }

  for (const slot of slots) {
    if (slot < 1 || slot > MAX_INTERVAL_SLOTS) continue;
    if (!isSlotDueNow(opts.punchInAt, slot, nowMs)) continue;

    const due = slotDueAtMs(opts.punchInAt, slot);
    const scheduledAt = new Date(due);

    const existing = await prisma.attendanceIntervalSnapshot.findUnique({
      where: { attendanceId_slot: { attendanceId: opts.attendanceId, slot } },
      select: { recordedAt: true },
    });
    if (existing && isValidIntervalSnapshot(opts.punchInAt, slot, existing.recordedAt)) {
      return { slot, alreadyRecorded: true };
    }

    const recentOther = await prisma.attendanceIntervalSnapshot.findFirst({
      where: {
        attendanceId: opts.attendanceId,
        slot: { not: slot },
        recordedAt: { gte: new Date(nowMs - MIN_GAP_BETWEEN_SLOTS_MS) },
      },
      select: { slot: true },
    });
    if (recentOther) return null;

    await prisma.attendanceIntervalSnapshot.upsert({
      where: { attendanceId_slot: { attendanceId: opts.attendanceId, slot } },
      create: {
        attendanceId: opts.attendanceId,
        slot,
        lat: opts.lat,
        lng: opts.lng,
        recordedAt: now,
        scheduledAt,
      },
      update: { lat: opts.lat, lng: opts.lng, recordedAt: now, scheduledAt },
    });

    await prisma.attendance.update({
      where: { id: opts.attendanceId },
      data: { lastKnownLat: opts.lat, lastKnownLng: opts.lng, lastKnownAt: now },
    });

    return { slot };
  }

  return null;
}
