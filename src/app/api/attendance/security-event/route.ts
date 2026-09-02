import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseClientSource } from "@/lib/clientSource";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = new Set(["vpn", "mock_gps", "spoof_app"]);

/** Native / web clients report VPN, mock GPS, or spoof-app detections. */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const violationType = String(body?.type || "").toLowerCase();
  if (!VALID_TYPES.has(violationType)) {
    return NextResponse.json({ error: "Invalid violation type." }, { status: 400 });
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

  const since = new Date(Date.now() - 15 * 60 * 1000);
  const dup = await prisma.securityViolationLog.findFirst({
    where: {
      userId: s.sub,
      violationType,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ ok: true, deduped: true });

  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const clientSource = parseClientSource(req);
  const action = typeof body?.action === "string" ? body.action.slice(0, 80) : "blocked";
  const detail = typeof body?.detail === "string" ? body.detail.slice(0, 500) : "";

  await prisma.securityViolationLog.create({
    data: {
      userId: s.sub,
      userName: user.name,
      userPhone: user.phone,
      userDesignation: user.designation,
      assemblyName: user.assemblyName,
      zone: user.zone,
      district: user.district,
      violationType,
      clientSource,
      action,
      detail,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    },
  });

  return NextResponse.json({ ok: true });
}
