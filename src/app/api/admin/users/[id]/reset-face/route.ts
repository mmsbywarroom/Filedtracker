import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canResetUserFace, canSeeUser } from "@/lib/hierarchy";

const schema = z.object({
  reason: z.string().trim().min(3, "Reason is required (at least 3 characters).").max(300),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canResetUserFace(s.admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message || "Reason is required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      phone: true,
      designation: true,
      zone: true,
      district: true,
      assemblyName: true,
      cluster: true,
      faceRegisteredAt: true,
    },
  });
  if (!user || !canSeeUser(s.admin, user)) {
    return NextResponse.json({ error: "User not in your scope." }, { status: 404 });
  }
  if (!user.faceRegisteredAt) {
    return NextResponse.json({ error: "Face is not registered for this user." }, { status: 400 });
  }

  const reason = parsed.data.reason.trim();
  const adminLabel = (s.admin.name || "").trim() || s.admin.email;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        faceDescriptorJson: null,
        faceImage: null,
        faceRegisteredAt: null,
      },
    }),
    prisma.faceResetLog.create({
      data: {
        userId: user.id,
        userName: user.name,
        userPhone: user.phone,
        userDesignation: user.designation,
        adminId: s.admin.id,
        adminName: adminLabel,
        adminEmail: s.admin.email,
        adminAccessLevel: s.admin.isSuper ? "Super" : s.admin.accessLevel,
        reason,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, message: `Face cleared for ${user.name}.` });
}
