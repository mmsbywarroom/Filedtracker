import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { closeOpenAttendance } from "@/lib/punchOut";

/** Auto punch-out when GPS is turned off. Uses last known location. No face / geofence. */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const attendance = await closeOpenAttendance({
    userId: s.sub,
    lat,
    lng,
    address: typeof body?.address === "string" ? body.address.slice(0, 200) : "GPS turned off",
    accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
    reason: "gps_off",
  });
  if (!attendance) return NextResponse.json({ ok: true, alreadyClosed: true });
  return NextResponse.json({ ok: true, attendance });
}
