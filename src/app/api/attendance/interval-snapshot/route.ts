import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  INTERVAL_SNAPSHOT_EARLY_MS,
  INTERVAL_SNAPSHOT_LATE_MS,
  isSlotDueNow,
  MAX_INTERVAL_SLOTS,
  slotDueAtMs,
} from "@/lib/attendanceIntervalFlag";

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

  const recordedAt = new Date();
  await prisma.attendanceIntervalSnapshot.upsert({
    where: { attendanceId_slot: { attendanceId: open.id, slot } },
    create: { attendanceId: open.id, slot, lat, lng, recordedAt },
    update: { lat, lng, recordedAt },
  });

  await prisma.attendance.update({
    where: { id: open.id },
    data: { lastKnownLat: lat, lastKnownLng: lng, lastKnownAt: recordedAt },
  });

  return NextResponse.json({ ok: true, slot, scheduledAt: new Date(due).toISOString() });
}
