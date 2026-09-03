import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { parseClientSource } from "@/lib/clientSource";
import { istDateString, istDayBounds } from "@/lib/dailyAttendance";
import { prisma } from "@/lib/prisma";

const VALID_TYPES = new Set(["vpn", "mock_gps", "spoof_app", "punch_evidence"]);

function mergeEvidenceDetail(prev: string, next: string) {
  const a = (prev || "").trim();
  const b = (next || "").trim();
  if (!a) return b.slice(0, 500);
  if (!b) return a.slice(0, 500);
  if (a.includes(b) || b.includes(a)) return (a.length >= b.length ? a : b).slice(0, 500);
  // Keep unique app / evidence fragments
  const parts = Array.from(new Set([...a.split(" · ").map((s) => s.trim()), ...b.split(" · ").map((s) => s.trim())].filter(Boolean)));
  return parts.join(" · ").slice(0, 500);
}

/** Native clients report VPN / fake-GPS evidence (one solid punch-in log per user per day). */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  let violationType = String(body?.type || "").toLowerCase();
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

  let action = typeof body?.action === "string" ? body.action.slice(0, 80) : "detected";
  let detail = typeof body?.detail === "string" ? body.detail.slice(0, 500) : "";
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const clientSource = parseClientSource(req);

  // Security evidence is ONLY for native-app punch. Reject web/browser reports.
  if (clientSource !== "native") {
    return NextResponse.json({ ok: true, skipped: "web" });
  }

  // Consolidate VPN / spoof / mock into one daily punch-evidence row for native punch audit.
  const isEvidence =
    violationType === "punch_evidence" ||
    action === "punch_evidence" ||
    action === "detected" ||
    action === "punch_allowed";

  if (isEvidence) {
    violationType = "punch_evidence";
    action = "punch_evidence";
  }

  if (violationType === "punch_evidence") {
    const day = istDateString();
    const { start, end } = istDayBounds(day);
    const existing = await prisma.securityViolationLog.findFirst({
      where: {
        userId: s.sub,
        violationType: "punch_evidence",
        createdAt: { gte: start, lte: end },
      },
      orderBy: { createdAt: "desc" },
    });

    const coords =
      Number.isFinite(lat) && Number.isFinite(lng)
        ? ` Punch coords: ${lat.toFixed(5)}, ${lng.toFixed(5)}.`
        : "";
    const evidencePrefix =
      "EVIDENCE · Native punch: third-party VPN/Fake GPS/spoof app on device at punch-in.";
    const nextDetail = detail.includes("EVIDENCE")
      ? detail
      : `${evidencePrefix} ${detail}${coords}`.trim().slice(0, 500);

    if (existing) {
      await prisma.securityViolationLog.update({
        where: { id: existing.id },
        data: {
          detail: mergeEvidenceDetail(existing.detail, nextDetail),
          action: "punch_evidence",
          clientSource: "native",
          lat: Number.isFinite(lat) ? lat : existing.lat,
          lng: Number.isFinite(lng) ? lng : existing.lng,
          userName: user.name,
          userPhone: user.phone,
          userDesignation: user.designation,
          assemblyName: user.assemblyName,
          zone: user.zone,
          district: user.district,
        },
      });
      return NextResponse.json({ ok: true, updated: true, id: existing.id });
    }

    await prisma.securityViolationLog.create({
      data: {
        userId: s.sub,
        userName: user.name,
        userPhone: user.phone,
        userDesignation: user.designation,
        assemblyName: user.assemblyName,
        zone: user.zone,
        district: user.district,
        violationType: "punch_evidence",
        clientSource: "native",
        action: "punch_evidence",
        detail: nextDetail,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      },
    });
    return NextResponse.json({ ok: true, created: true });
  }

  // Legacy separate types: short dedupe window
  const windowMs = action === "blocked" ? 2 * 60 * 1000 : 60 * 60 * 1000;
  const since = new Date(Date.now() - windowMs);
  const dup = await prisma.securityViolationLog.findFirst({
    where: {
      userId: s.sub,
      violationType,
      action,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ ok: true, deduped: true });

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
