import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { GPS_SPOOF_FLAG_LABELS, type GpsSpoofFlag } from "@/lib/gpsAntiSpoof";
import { reviewScopeWhere } from "@/lib/hierarchy";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "";
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const outcome = searchParams.get("outcome") || "";

  const scoped = await prisma.user.findMany({
    where: reviewScopeWhere(s.admin),
    select: { id: true },
  });
  const ids = scoped.map((u) => u.id);
  if (!ids.length) return NextResponse.json({ logs: [] });

  const where: {
    userId: { in: string[] };
    createdAt?: { gte: Date; lte: Date };
    outcome?: string;
  } = { userId: { in: ids } };

  if (date) {
    where.createdAt = {
      gte: new Date(`${date}T00:00:00+05:30`),
      lte: new Date(`${date}T23:59:59.999+05:30`),
    };
  }
  if (outcome === "blocked" || outcome === "flagged" || outcome === "bypassed") {
    where.outcome = outcome;
  }

  const rows = await prisma.gpsSpoofLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const bypassRows =
    userIds.length === 0
      ? []
      : await prisma.gpsSpoofBypass.findMany({
          where: { userId: { in: userIds }, expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: "desc" },
        });
  const bypassByUser = new Map<string, string>();
  for (const b of bypassRows) {
    if (!bypassByUser.has(b.userId)) bypassByUser.set(b.userId, b.expiresAt.toISOString());
  }

  const logs = rows
    .filter((r) => {
      if (!q) return true;
      const text = [
        r.userName,
        r.userPhone,
        r.assemblyName,
        r.zone,
        r.district,
        r.detail,
        r.action,
        r.outcome,
        ...r.flags,
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    })
    .map((r) => ({
      id: r.id,
      when: r.createdAt.toISOString(),
      userId: r.userId,
      name: r.userName,
      phone: r.userPhone,
      designation: r.userDesignation,
      assemblyName: r.assemblyName,
      zone: r.zone,
      district: r.district,
      action: r.action,
      outcome: r.outcome,
      flags: r.flags.map((f) => ({
        code: f,
        label: GPS_SPOOF_FLAG_LABELS[f as GpsSpoofFlag] || f,
      })),
      lat: r.lat,
      lng: r.lng,
      accuracy: r.accuracy,
      sampleCount: r.sampleCount,
      maxSpreadM: r.maxSpreadM,
      detail: r.detail,
      attendanceId: r.attendanceId,
      bypassUntil: bypassByUser.get(r.userId) ?? null,
    }));

  return NextResponse.json({ logs });
}
