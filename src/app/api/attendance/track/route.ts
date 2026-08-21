import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { haversineMeters, isPlausibleStep } from "@/lib/utils";
import { autoPunchOutIfStale } from "@/lib/punchOut";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const closed = await autoPunchOutIfStale(s.sub);
  if (closed) {
    return NextResponse.json(
      { error: "Session auto punched out after 12 hours.", code: "AUTO_12H", attendance: closed },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const points = Array.isArray(body?.points) ? body.points : [];
  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "desc" }, take: 1 } },
  });
  if (!open) return NextResponse.json({ error: "No active session." }, { status: 400 });

  const cleaned: { lat: number; lng: number; recordedAt: Date; accuracy: number | null }[] = [];
  let prev = open.points[0] ? { lat: open.points[0].lat, lng: open.points[0].lng } : null;
  for (const p of points.slice(0, 80)) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const next = { lat, lng };
    if (prev && !isPlausibleStep(prev, next, Number(p.accuracy))) continue;
    prev = next;
    cleaned.push({
      lat,
      lng,
      recordedAt: p.recordedAt ? new Date(p.recordedAt) : new Date(),
      accuracy: Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : null,
    });
  }
  if (!cleaned.length) return NextResponse.json({ ok: true });

  await prisma.trackPoint.createMany({
    data: cleaned.map((p) => ({ ...p, attendanceId: open.id })),
  });

  let extra = 0;
  prev = open.points[0] ? { lat: open.points[0].lat, lng: open.points[0].lng } : null;
  for (const p of cleaned) {
    if (prev) extra += haversineMeters(prev, p);
    prev = p;
  }
  await prisma.attendance.update({
    where: { id: open.id },
    data: { distanceMeters: { increment: extra } },
  });

  return NextResponse.json({ ok: true });
}
