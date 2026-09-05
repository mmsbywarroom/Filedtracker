import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { canSeeUser, isSuperAdmin } from "@/lib/hierarchy";
import { prisma } from "@/lib/prisma";

/** Super admin only: delete one daily attendance session (route + 30-min checks cascade). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperAdmin(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const row = await prisma.attendance.findUnique({
    where: { id: params.id },
    include: { user: true },
  });
  if (!row || !canSeeUser(s.admin, row.user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.attendance.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
