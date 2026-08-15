import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";

const userSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string(),
  assemblyName: z.string().min(1).max(80),
  sectorAllotted: z.string().min(1).max(80),
  zone: z.string().min(1).max(80),
  district: z.string().min(1).max(80),
  isActive: z.boolean().optional(),
});

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      attendances: {
        orderBy: { punchInAt: "desc" },
        take: 1,
        select: { punchInAt: true, punchOutAt: true },
      },
    },
  });
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      assemblyName: u.assemblyName,
      sectorAllotted: u.sectorAllotted,
      zone: u.zone,
      district: u.district,
      isActive: u.isActive,
      faceRegistered: Boolean(u.faceRegisteredAt),
      lastPunchIn: u.attendances[0]?.punchInAt ?? null,
      lastPunchOut: u.attendances[0]?.punchOutAt ?? null,
    })),
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = userSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });
  const phone = normalizePhone(parsed.data.phone);
  if (!phone) return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
  try {
    const user = await prisma.user.create({
      data: { ...parsed.data, phone },
    });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "This mobile number already exists." }, { status: 409 });
  }
}
