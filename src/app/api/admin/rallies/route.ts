import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(2).max(120),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rallies = await prisma.rally.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true } } },
  });
  return NextResponse.json({
    rallies: rallies.map((r) => ({
      id: r.id,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      isActive: r.isActive,
      userCount: r._count.users,
    })),
  });
}

export async function POST(req: Request) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Venue name, lat and lng required." }, { status: 400 });
  if (body.data.isActive !== false) {
    await prisma.rally.updateMany({ data: { isActive: false } });
  }
  const rally = await prisma.rally.create({
    data: {
      name: body.data.name,
      lat: body.data.lat,
      lng: body.data.lng,
      isActive: body.data.isActive !== false,
    },
  });
  return NextResponse.json({ rally });
}
