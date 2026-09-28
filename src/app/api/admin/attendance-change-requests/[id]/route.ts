import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  applyManualAttendanceMark,
  attendanceReviewSide,
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
  const side = request ? attendanceReviewSide(s.admin, request) : null;
  if (!request || !side) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const noteText = parsed.data.adminNote?.trim() || null;
  const reviewerName = (s.admin.name || "").trim() || s.admin.email;
  const now = new Date();

  if (parsed.data.status === "rejected") {
    const data: Record<string, unknown> = {
      status: "rejected",
      adminNote: noteText,
      reviewedAt: now,
      reviewedById: s.admin.id,
      reviewedByEmail: s.admin.email,
    };
    if (request.reviewLevel === "BOTH") {
      if (side === "dlc" || side === "both") {
        data.dlcDecision = "rejected";
        data.dlcReviewedAt = now;
        data.dlcReviewedById = s.admin.id;
        data.dlcReviewedByName = reviewerName;
        data.dlcNote = noteText;
      }
      if (side === "cluster" || side === "both") {
        data.clusterDecision = "rejected";
        data.clusterReviewedAt = now;
        data.clusterReviewedById = s.admin.id;
        data.clusterReviewedByName = reviewerName;
        data.clusterNote = noteText;
      }
      if (side === "dlc" && (request.clusterDecision || "pending") === "pending") {
        data.clusterDecision = "closed";
      }
      if (side === "cluster" && (request.dlcDecision || "pending") === "pending") {
        data.dlcDecision = "closed";
      }
    }
    const updated = await prisma.attendanceChangeRequest.update({
      where: { id: request.id },
      data,
    });
    return NextResponse.json({ ok: true, request: updated });
  }

  const finishesNow = request.reviewLevel !== "BOTH" || side === "dlc" || side === "cluster" || side === "both";

  let mark = null;
  if (finishesNow) {
    const dateYmd =
      request.date instanceof Date
        ? request.date.toISOString().slice(0, 10)
        : String(request.date).slice(0, 10);
    mark = await applyManualAttendanceMark({
      userId: request.userId,
      dateYmd,
      status: request.proposedStatus as AttendanceMarkStatus,
      note: request.note,
      adminId: request.requestedById,
      adminName: request.requestedByName,
      adminEmail: request.requestedByEmail || s.admin.email,
    });
  }

  const data: Record<string, unknown> = {
    status: finishesNow ? "approved" : "pending",
    adminNote: noteText || request.adminNote,
    reviewedAt: finishesNow ? now : request.reviewedAt,
    reviewedById: finishesNow ? s.admin.id : request.reviewedById,
    reviewedByEmail: finishesNow ? s.admin.email : request.reviewedByEmail,
  };
  if (request.reviewLevel === "BOTH") {
    if (side === "dlc" || side === "both") {
      data.dlcDecision = "approved";
      data.dlcReviewedAt = now;
      data.dlcReviewedById = s.admin.id;
      data.dlcReviewedByName = reviewerName;
      data.dlcNote = noteText;
    }
    if (side === "cluster" || side === "both") {
      data.clusterDecision = "approved";
      data.clusterReviewedAt = now;
      data.clusterReviewedById = s.admin.id;
      data.clusterReviewedByName = reviewerName;
      data.clusterNote = noteText;
    }
    if (side === "dlc" && (request.clusterDecision || "pending") === "pending") {
      data.clusterDecision = "closed";
    }
    if (side === "cluster" && (request.dlcDecision || "pending") === "pending") {
      data.dlcDecision = "closed";
    }
  }

  const updated = await prisma.attendanceChangeRequest.update({
    where: { id: request.id },
    data,
  });

  return NextResponse.json({
    ok: true,
    request: updated,
    mark,
    waitingForOther: false,
  });
}
