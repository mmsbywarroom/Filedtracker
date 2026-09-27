import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser, userScopeWhere } from "@/lib/hierarchy";
import { CALL_OUTCOMES, callOutcomeLabel } from "@/lib/callList";

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scoped = await prisma.user.findMany({
    where: { AND: [userScopeWhere(s.admin), { isActive: true }] },
    select: {
      id: true,
      designation: true,
      zone: true,
      district: true,
      assemblyName: true,
      cluster: true,
    },
  });
  const userIds = scoped.filter((u) => canSeeUser(s.admin, u)).map((u) => u.id);
  if (!userIds.length) {
    return NextResponse.json({
      summary: emptySummary(),
      rows: [],
    });
  }

  const [assigned, outcomes] = await Promise.all([
    prisma.callAssignment.count({ where: { userId: { in: userIds } } }),
    prisma.callOutcome.findMany({
      where: { userId: { in: userIds } },
      include: {
        user: { select: { name: true, phone: true, designation: true } },
        contact: { select: { name: true, phone: true, vehicleNumber: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 4000,
    }),
  ]);

  const byStatus = Object.fromEntries(CALL_OUTCOMES.map((o) => [o.value, 0]));
  let coming = 0;
  let notComing = 0;
  let withOthers = 0;
  for (const row of outcomes) {
    if (row.status in byStatus) byStatus[row.status] += 1;
    if (row.attending === "coming") coming += 1;
    if (row.attending === "not_coming") notComing += 1;
    if (row.companions === "yes") withOthers += 1;
  }

  return NextResponse.json({
    summary: {
      assigned,
      called: outcomes.filter((o) => o.status).length,
      pending: Math.max(0, assigned - outcomes.filter((o) => o.status).length),
      coming,
      notComing,
      withOthers,
      byStatus,
      statuses: CALL_OUTCOMES,
    },
    rows: outcomes.map((row) => ({
      id: row.id,
      callerName: row.user.name,
      callerPhone: row.user.phone,
      callerDesignation: row.user.designation,
      personName: row.contact.name,
      mobile: row.contact.phone,
      vehicleNumber: row.contact.vehicleNumber,
      status: row.status,
      statusLabel: callOutcomeLabel(row.status) || row.status,
      attending: row.attending,
      companions: row.companions,
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}

function emptySummary() {
  return {
    assigned: 0,
    called: 0,
    pending: 0,
    coming: 0,
    notComing: 0,
    withOthers: 0,
    byStatus: Object.fromEntries(CALL_OUTCOMES.map((o) => [o.value, 0])),
    statuses: CALL_OUTCOMES,
  };
}
