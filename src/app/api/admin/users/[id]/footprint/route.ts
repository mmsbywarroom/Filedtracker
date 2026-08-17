import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downsample } from "@/lib/utils";

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
    take: 20,
    include: { points: { orderBy: { recordedAt: "desc" }, take: 800 } },
  });
  return NextResponse.json({
    user,
    attendances: attendances.map((a) => ({ ...a, points: downsample([...a.points].reverse(), 280) })),
  });
}
