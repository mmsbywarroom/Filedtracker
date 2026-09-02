import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  INTERVAL_SNAPSHOT_EARLY_MS,
  INTERVAL_SNAPSHOT_LATE_MS,
  isSlotDueNow,
  isValidIntervalSnapshot,
  MAX_INTERVAL_SLOTS,
  slotDueAtMs,
} from "@/lib/attendanceIntervalFlag";

const MIN_GAP_BETWEEN_SLOTS_MS = 8 * 60 * 1000;

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const slot = Number(body?.slot);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_INTERVAL_SLOTS) {
    return NextResponse.json({ error: "Invalid interval slot." }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location required." }, { status: 400 });
  }

  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    select: { id: true, punchInAt: true },
  });
  if (!open) return NextResponse.json({ error: "No active session." }, { status: 400 });

  const now = Date.now();
  const due = slotDueAtMs(open.punchInAt, slot);
  const scheduledAt = new Date(due);

  if (now < due - INTERVAL_SNAPSHOT_EARLY_MS) {
    return NextResponse.json(
      { error: "This interval check is not due yet.", code: "SLOT_TOO_EARLY" },
      { status: 400 }
    );
  }
  if (now > due + INTERVAL_SNAPSHOT_LATE_MS) {
    return NextResponse.json(
      { error: "This interval was missed — cannot backfill old slots.", code: "SLOT_MISSED" },
      { status: 400 }
    );
  }
  if (!isSlotDueNow(open.punchInAt, slot, now)) {
    return NextResponse.json({ error: "Outside allowed window for this interval.", code: "SLOT_WINDOW" }, { status: 400 });
  }

  const recentOther = await prisma.attendanceIntervalSnapshot.findFirst({
    where: {
      attendanceId: open.id,
      slot: { not: slot },
      recordedAt: { gte: new Date(now - MIN_GAP_BETWEEN_SLOTS_MS) },
    },
    select: { slot: true, recordedAt: true },
  });
  if (recentOther) {
    return NextResponse.json(
      {
        error: "Another interval was just recorded. Wait for the next 30-minute check.",
        code: "BATCH_THROTTLE",
      },
      { status: 429 }
    );
  }

  const existing = await prisma.attendanceIntervalSnapshot.findUnique({
    where: { attendanceId_slot: { attendanceId: open.id, slot } },
    select: { recordedAt: true },
  });
  if (existing && isValidIntervalSnapshot(open.punchInAt, slot, existing.recordedAt)) {
    return NextResponse.json({ ok: true, slot, scheduledAt: scheduledAt.toISOString(), alreadyRecorded: true });
  }

  const recordedAt = new Date();
  if (!isValidIntervalSnapshot(open.punchInAt, slot, recordedAt)) {
    return NextResponse.json({ error: "Recording time outside allowed window.", code: "SLOT_WINDOW" }, { status: 400 });
  }

  await prisma.attendanceIntervalSnapshot.upsert({
    where: { attendanceId_slot: { attendanceId: open.id, slot } },
    create: { attendanceId: open.id, slot, lat, lng, recordedAt, scheduledAt },
    update: { lat, lng, recordedAt, scheduledAt },
  });

  await prisma.attendance.update({
    where: { id: open.id },
    data: { lastKnownLat: lat, lastKnownLng: lng, lastKnownAt: recordedAt },
  });

  return NextResponse.json({ ok: true, slot, scheduledAt: scheduledAt.toISOString() });
}
