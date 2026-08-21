import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeFaceImage } from "@/lib/faceImage";
import { assertInsideAssignedAssembly } from "@/lib/assemblyGeofence";
import { closeOpenAttendance } from "@/lib/punchOut";

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

  const user = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { assemblyName: true, designation: true },
  });
  const geo = assertInsideAssignedAssembly({
    assemblyName: user?.assemblyName,
    designation: user?.designation,
    lat,
    lng,
  });
  if (!geo.ok) {
    return NextResponse.json({ error: geo.error, code: geo.code }, { status: 403 });
  }

  const attendance = await closeOpenAttendance({
    userId: s.sub,
    lat,
    lng,
    address,
    accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
    reason: "manual",
    punchOutFace,
  });
  if (!attendance) return NextResponse.json({ error: "No active punch in." }, { status: 400 });
  return NextResponse.json({ attendance, ok: true });
}
