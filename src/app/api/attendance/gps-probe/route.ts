import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autoPunchOutIfStale } from "@/lib/punchOut";
import { userFacingGpsError } from "@/lib/gpsAntiSpoof";
import { GPS_RANDOM_PROBE_COUNT, submitRandomGpsProbe } from "@/lib/gpsRandomProbe";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await autoPunchOutIfStale(s.sub).catch(() => null);

  const body = await req.json().catch(() => null);
  const slot = Number(body?.slot);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const accuracy = Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null;

  if (!Number.isInteger(slot) || slot < 1 || slot > GPS_RANDOM_PROBE_COUNT) {
    return NextResponse.json({ error: "Invalid random GPS check." }, { status: 400 });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: s.sub },
    select: {
      name: true,
      phone: true,
      designation: true,
      assemblyName: true,
      zone: true,
      district: true,
    },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const open = await prisma.attendance.findFirst({
    where: { userId: s.sub, punchOutAt: null },
    select: { id: true },
    orderBy: { punchInAt: "desc" },
  });
  if (!open) return NextResponse.json({ error: "No active session." }, { status: 400 });

  const result = await submitRandomGpsProbe({
    userId: s.sub,
    user: {
      name: user.name,
      phone: user.phone,
      designation: user.designation,
      assemblyName: user.assemblyName,
      zone: user.zone,
      district: user.district,
    },
    attendanceId: open.id,
    slot,
    lat,
    lng,
    accuracy,
  });

  if ("blocked" in result && result.blocked) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        flags: result.flags,
        message: userFacingGpsError(result.flags),
      },
      { status: 409 }
    );
  }

  if (!result.ok) {
    const status =
      result.code === "TOO_EARLY" || result.code === "TOO_LATE" || result.code === "INVALID_PROBE"
        ? 400
        : 409;
    return NextResponse.json({ error: result.error, code: result.code }, { status });
  }

  return NextResponse.json(result);
}
