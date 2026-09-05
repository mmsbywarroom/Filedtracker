import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireSuperAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const headCount = Math.max(0, Math.min(200, Math.round(Number(body?.headCount) || 0)));
  const row = await prisma.rallyCheckin.update({
    where: { id: params.id },
    data: { headCount },
    select: { id: true, headCount: true },
  });
  return NextResponse.json({ ok: true, row });
}
