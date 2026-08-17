import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { downsample } from "@/lib/utils";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.attendance.findFirst({
    where: { id: params.id, userId: s.sub },
    include: { points: { orderBy: { recordedAt: "desc" }, take: 400 } },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    attendance: {
      ...row,
      points: downsample([...row.points].reverse(), 280),
    },
  });
}
