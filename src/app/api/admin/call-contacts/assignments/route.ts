import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser } from "@/lib/hierarchy";

export async function GET(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = new URL(req.url).searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ error: "Choose a user." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !canSeeUser(s.admin, user)) return NextResponse.json({ error: "User not in your scope." }, { status: 404 });
  const rows = await prisma.callAssignment.findMany({
    where: { userId },
    select: { contactId: true },
  });
  return NextResponse.json({ contactIds: rows.map((r) => r.contactId) });
}

const putSchema = z.object({
  userId: z.string().min(1),
  contactIds: z.array(z.string().min(1)).max(5000),
});

export async function PUT(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid assignment." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user || !canSeeUser(s.admin, user)) return NextResponse.json({ error: "User not in your scope." }, { status: 404 });

  const uniqueIds = Array.from(new Set(parsed.data.contactIds));
  const found = uniqueIds.length
    ? await prisma.callContact.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } })
    : [];
  const ids = found.map((c) => c.id);

  await prisma.$transaction([
    prisma.callAssignment.deleteMany({ where: { userId: user.id } }),
    ...(ids.length
      ? [
          prisma.callAssignment.createMany({
            data: ids.map((contactId) => ({ userId: user.id, contactId })),
          }),
        ]
      : []),
    prisma.callContact.updateMany({
      where: { assigneePhone: user.phone, ...(ids.length ? { id: { notIn: ids } } : {}) },
      data: { assigneePhone: "" },
    }),
    ...(ids.length
      ? [
          prisma.callContact.updateMany({
            where: { id: { in: ids } },
            data: { assigneePhone: user.phone },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, assigned: ids.length });
}
