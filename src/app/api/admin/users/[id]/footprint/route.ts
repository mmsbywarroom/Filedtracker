import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, phone: true, assemblyName: true, sectorAllotted: true, zone: true, district: true },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const attendances = await prisma.attendance.findMany({
    where: { userId: params.id },
    orderBy: { punchInAt: "desc" },
    include: { points: { orderBy: { recordedAt: "asc" } } },
  });
  return NextResponse.json({ user, attendances });
}
