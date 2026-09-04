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
import { maybeRecordDueIntervalSnapshot } from "@/lib/recordDueIntervalSnapshot";

export async function POST(req: Request) {
  const s = await requireUser(req);
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
    select: { id: true, punchInAt: true, punchInClient: true },
  });
  if (!open) return NextResponse.json({ error: "No active session." }, { status: 400 });

  // Attendance FLAG intervals are only for native-app punch-in sessions.
  if (open.punchInClient !== "native") {
    return NextResponse.json(
      { error: "Interval checks only apply to native app punch-in.", code: "NATIVE_ONLY" },
      { status: 400 }
    );
  }

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

  const recorded = await maybeRecordDueIntervalSnapshot({
    attendanceId: open.id,
    punchInAt: open.punchInAt,
    punchInClient: open.punchInClient,
    lat,
    lng,
    now: new Date(now),
    preferredSlot: slot,
  });

  if (!recorded) {
    return NextResponse.json(
      {
        error: "Another interval was just recorded. Wait for the next 30-minute check.",
        code: "BATCH_THROTTLE",
      },
      { status: 429 }
    );
  }

  return NextResponse.json({
    ok: true,
    slot: recorded.slot,
    scheduledAt: scheduledAt.toISOString(),
    alreadyRecorded: !!recorded.alreadyRecorded,
  });
}
