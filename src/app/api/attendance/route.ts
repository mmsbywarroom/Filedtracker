import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downsample } from "@/lib/utils";
import { sanitizeFaceImage } from "@/lib/faceImage";
import { assertInsideAssignedAssembly } from "@/lib/assemblyGeofence";

export async function GET() {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    include: { points: { orderBy: { recordedAt: "desc" }, take: 400 } },
    orderBy: { punchInAt: "desc" },
  });
  const history = await prisma.attendance.findMany({
    where: { userId: s.sub },
    orderBy: { punchInAt: "desc" },
    take: 1,
  });
  const mapId = open?.id || history[0]?.id;
  const openPts = [...(open?.points || [])].reverse();
  let mapPoints: { lat: number; lng: number; recordedAt: Date }[] = [];
  if (open && open.id === mapId) {
    mapPoints = downsample(openPts, 280);
  } else if (mapId) {
    const pts = await prisma.trackPoint.findMany({
      where: { attendanceId: mapId },
      orderBy: { recordedAt: "desc" },
      take: 400,
    });
    mapPoints = downsample([...pts].reverse(), 280);
  }
  return NextResponse.json({
    open: open ? { ...open, points: mapPoints } : null,
    history: history.map((h) => ({ ...h, points: h.id === mapId ? mapPoints : [] })),
  });
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

  const user = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { assemblyName: true, designation: true, isActive: true },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Account not found or inactive." }, { status: 403 });
  }
  const geo = assertInsideAssignedAssembly({
    assemblyName: user.assemblyName,
    designation: user.designation,
    lat,
    lng,
  });
  if (!geo.ok) {
    return NextResponse.json({ error: geo.error, code: geo.code }, { status: 403 });
  }

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
    select: { id: true, punchInAt: true },
  });
  return NextResponse.json({ attendance, ok: true });
}
