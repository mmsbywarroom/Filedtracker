import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { clientSourceLabel } from "@/lib/clientSource";
import { prisma } from "@/lib/prisma";
import { reviewScopeWhere } from "@/lib/hierarchy";

const TYPE_LABELS: Record<string, string> = {
  vpn: "VPN / VPN app",
  mock_gps: "Fake GPS (mock location)",
  spoof_app: "Spoof / fake GPS app",
};

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || "";
  const type = searchParams.get("type") || "";
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const scoped = await prisma.user.findMany({
    where: reviewScopeWhere(s.admin),
    select: { id: true },
  });
  const ids = scoped.map((u) => u.id);
  if (!ids.length) return NextResponse.json({ logs: [], typeLabels: TYPE_LABELS });

  const where: Record<string, unknown> = { userId: { in: ids } };
  if (type) where.violationType = type;
  if (date) {
    const start = new Date(`${date}T00:00:00+05:30`);
    const end = new Date(`${date}T23:59:59.999+05:30`);
    where.createdAt = { gte: start, lte: end };
  }

  const rows = await prisma.securityViolationLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const logs = rows
    .filter((r) => {
      if (!q) return true;
      const text = [r.userName, r.userPhone, r.userDesignation, r.assemblyName, r.zone, r.district, r.detail]
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    })
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.userName,
      phone: r.userPhone,
      designation: r.userDesignation,
      assemblyName: r.assemblyName,
      zone: r.zone,
      district: r.district,
      violationType: r.violationType,
      violationLabel: TYPE_LABELS[r.violationType] || r.violationType,
      clientSource: r.clientSource,
      clientLabel: clientSourceLabel(r.clientSource),
      action: r.action,
      detail: r.detail,
      lat: r.lat,
      lng: r.lng,
      createdAt: r.createdAt.toISOString(),
    }));

  return NextResponse.json({ logs, typeLabels: TYPE_LABELS });
}
