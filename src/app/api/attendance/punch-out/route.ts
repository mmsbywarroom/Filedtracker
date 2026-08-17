import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { haversineMeters } from "@/lib/utils";
import { sanitizeFaceImage } from "@/lib/faceImage";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const address = typeof body?.address === "string" ? body.address.slice(0, 200) : null;
  const punchOutFace = sanitizeFaceImage(body?.image);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required for punch out." }, { status: 400 });
  }
  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "asc" } } },
  });
  if (!open) return NextResponse.json({ error: "No active punch in." }, { status: 400 });

  const last = open.points[open.points.length - 1];
  let distance = open.distanceMeters;
  if (last) distance += haversineMeters({ lat: last.lat, lng: last.lng }, { lat, lng });

  const base = {
    punchOutAt: new Date(),
    punchOutLat: lat,
    punchOutLng: lng,
    punchOutAddress: address,
    distanceMeters: distance,
    points: {
      create: { lat, lng, recordedAt: new Date(), accuracy: Number(body?.accuracy) || null },
    },
  };

  try {
    const attendance = await prisma.attendance.update({
      where: { id: open.id },
      data: { ...base, punchOutFace },
      include: { points: { orderBy: { recordedAt: "asc" } } },
    });
    return NextResponse.json({ attendance });
  } catch {
    const attendance = await prisma.attendance.update({
      where: { id: open.id },
      data: base,
      include: { points: { orderBy: { recordedAt: "asc" } } },
    });
    return NextResponse.json({ attendance });
  }
}
