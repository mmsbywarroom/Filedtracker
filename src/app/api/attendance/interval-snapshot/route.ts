import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_INTERVAL_SLOTS } from "@/lib/attendanceIntervalFlag";

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

  await prisma.attendanceIntervalSnapshot.upsert({
    where: { attendanceId_slot: { attendanceId: open.id, slot } },
    create: { attendanceId: open.id, slot, lat, lng },
    update: { lat, lng, recordedAt: new Date() },
  });

  return NextResponse.json({ ok: true, slot });
}
