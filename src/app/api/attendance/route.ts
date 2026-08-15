import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeFaceImage } from "@/lib/faceImage";

export async function GET() {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "asc" } } },
    orderBy: { punchInAt: "desc" },
  });
  const history = await prisma.attendance.findMany({
    where: { userId: s.sub },
    orderBy: { punchInAt: "desc" },
    take: 8,
    include: { points: { orderBy: { recordedAt: "asc" } } },
  });
  return NextResponse.json({ open, history });
}

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const address = typeof body?.address === "string" ? body.address.slice(0, 200) : null;
  const punchInFace = sanitizeFaceImage(body?.image);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required for punch in." }, { status: 400 });
  }
  const existing = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
  });
  if (existing) return NextResponse.json({ error: "Already punched in." }, { status: 400 });

  const attendance = await prisma.attendance.create({
    data: {
      userId: s.sub,
      punchInAt: new Date(),
      punchInLat: lat,
      punchInLng: lng,
      punchInAddress: address,
      punchInFace,
      points: {
        create: { lat, lng, recordedAt: new Date(), accuracy: Number(body?.accuracy) || null },
      },
    },
    include: { points: true },
  });
  return NextResponse.json({ attendance });
}
