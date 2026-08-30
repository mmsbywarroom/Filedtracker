import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { istDayBounds } from "@/lib/dailyAttendance";
import { rallyDateYmd } from "@/lib/rallies";

const schema = z.object({
  name: z.string().min(2).max(120).optional(),
  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid rally." }, { status: 400 });
  if (body.data.isActive === true) {
    await prisma.rally.updateMany({ data: { isActive: false } });
  }
  const { scheduledDate, ...rest } = body.data;
  const rally = await prisma.rally.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(scheduledDate ? { scheduledDate: istDayBounds(scheduledDate).dateOnly } : {}),
    },
  });
  return NextResponse.json({
    rally: {
      ...rally,
      scheduledDate: rallyDateYmd(rally.scheduledDate),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.rally.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
