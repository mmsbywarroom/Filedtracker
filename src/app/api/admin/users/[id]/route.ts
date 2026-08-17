import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { DESIGNATIONS, canSeeUser } from "@/lib/hierarchy";

const userSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string(),
  designation: z.string().optional(),
  assemblyName: z.string().min(1).max(80),
  sectorAllotted: z.string().min(1).max(80),
  zone: z.string().min(1).max(80),
  district: z.string().min(1).max(80),
  cluster: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || !canSeeUser(s.admin, existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = userSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });
  const data = { ...parsed.data };
  if (data.phone) {
    const phone = normalizePhone(data.phone);
    if (!phone) return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
    data.phone = phone;
  }
  if (data.designation && !DESIGNATIONS.includes(data.designation as (typeof DESIGNATIONS)[number])) {
    delete data.designation;
  }
  try {
    const user = await prisma.user.update({ where: { id: params.id }, data });
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Could not update user." }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || !canSeeUser(s.admin, existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.user.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
