import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { closeOpenAttendance, type PunchOutReason } from "@/lib/punchOut";
import { prisma } from "@/lib/prisma";

const ALLOWED: PunchOutReason[] = ["fake_gps", "vpn"];

/**
 * Auto punch-out when Fake GPS (or VPN, if client reports) is detected mid-session.
 * No face / geofence — same pattern as gps-off.
 */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const reasonRaw = String(body?.reason || "fake_gps");
  const reason: PunchOutReason = ALLOWED.includes(reasonRaw as PunchOutReason)
    ? (reasonRaw as PunchOutReason)
    : "fake_gps";
  const address =
    typeof body?.address === "string" && body.address.trim()
      ? body.address.slice(0, 200)
      : reason === "vpn"
        ? "Auto punch-out: VPN detected after punch-in"
        : "Auto punch-out: Fake GPS (mock location) detected after punch-in";

  const attendance = await closeOpenAttendance({
    userId: s.sub,
    lat,
    lng,
    address,
    accuracy: Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null,
    reason,
  });

  try {
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
    if (user) {
      await prisma.securityViolationLog.create({
        data: {
          userId: s.sub,
          userName: user.name,
          userPhone: user.phone,
          userDesignation: user.designation,
          assemblyName: user.assemblyName,
          zone: user.zone,
          district: user.district,
          violationType: reason === "vpn" ? "vpn" : "mock_gps",
          action: "auto_punch_out",
          detail: address,
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          clientSource: "native",
        },
      });
    }
  } catch {
    // never fail punch-out path on logging
  }

  if (!attendance) return NextResponse.json({ ok: true, alreadyClosed: true });
  return NextResponse.json({ ok: true, attendance });
}
