import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canReviewLeave } from "@/lib/hierarchy";

const schema = z.object({
  status: z.enum(["approved", "rejected"]),
  adminNote: z.string().max(300).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid decision." }, { status: 400 });

  const leave = await prisma.leaveRequest.findUnique({
    where: { id: params.id },
    include: { user: true },
  });
  if (!leave || !canReviewLeave(s.admin, leave.user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (leave.status !== "pending") {
    return NextResponse.json({ error: "This request is already reviewed." }, { status: 400 });
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: {
      status: parsed.data.status,
      adminNote: parsed.data.adminNote?.trim() || null,
      reviewedAt: new Date(),
      reviewedBy: s.admin.email,
    },
  });
  return NextResponse.json({ leave: updated, ok: true });
}
