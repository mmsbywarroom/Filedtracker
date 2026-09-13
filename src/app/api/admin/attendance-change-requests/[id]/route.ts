import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  applyManualAttendanceMark,
  canReviewAttendanceChangeRequest,
  type AttendanceMarkStatus,
} from "@/lib/attendanceChangeApproval";

const schema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminNote: z.string().max(300).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision." }, { status: 400 });

  const request = await prisma.attendanceChangeRequest.findUnique({
    where: { id: params.id },
    include: {
      user: {
        select: {
          id: true,
          designation: true,
          zone: true,
          district: true,
          assemblyName: true,
          cluster: true,
          assemblies: true,
        },
      },
    },
  });
  if (!request || !canReviewAttendanceChangeRequest(s.admin, request)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "This request is already reviewed." }, { status: 400 });
  }

  if (parsed.data.status === "rejected") {
    const updated = await prisma.attendanceChangeRequest.update({
      where: { id: request.id },
      data: {
        status: "rejected",
        adminNote: parsed.data.adminNote?.trim() || null,
        reviewedAt: new Date(),
        reviewedById: s.admin.id,
        reviewedByEmail: s.admin.email,
      },
    });
    return NextResponse.json({ ok: true, request: updated });
  }

  const dateYmd =
    request.date instanceof Date
      ? request.date.toISOString().slice(0, 10)
      : String(request.date).slice(0, 10);
  const mark = await applyManualAttendanceMark({
    userId: request.userId,
    dateYmd,
    status: request.proposedStatus as AttendanceMarkStatus,
    note: request.note,
    adminId: request.requestedById,
    adminName: request.requestedByName,
    adminEmail: request.requestedByEmail || s.admin.email,
  });

  const updated = await prisma.attendanceChangeRequest.update({
    where: { id: request.id },
    data: {
      status: "approved",
      adminNote: parsed.data.adminNote?.trim() || null,
      reviewedAt: new Date(),
      reviewedById: s.admin.id,
      reviewedByEmail: s.admin.email,
    },
  });

  return NextResponse.json({ ok: true, request: updated, mark });
}
