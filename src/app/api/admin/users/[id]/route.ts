import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import { DESIGNATIONS, canSeeUser, isSuperAdmin } from "@/lib/hierarchy";
import { normalizeUserAssemblies } from "@/lib/userAssemblies";

const userSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string(),
  designation: z.string().optional(),
  assemblyName: z.string().min(1).max(80),
  assemblies: z.array(z.string()).optional(),
  sectorAllotted: z.string().min(1).max(80),
  zone: z.string().min(1).max(80),
  district: z.string().min(1).max(80),
  cluster: z.string().optional(),
  isActive: z.boolean().optional(),
  clearFace: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || !canSeeUser(s.admin, existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = userSchema.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid details." }, { status: 400 });
  if (!isSuperAdmin(s.admin)) {
    const keys = Object.keys(parsed.data).filter((k) => parsed.data[k as keyof typeof parsed.data] !== undefined);
    if (keys.length !== 1 || keys[0] !== "isActive") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (parsed.data.clearFace) {
    return NextResponse.json(
      { error: "Use Reset face with a reason. Face reset is logged for audit." },
      { status: 400 }
    );
  }
  const { clearFace: _clearFace, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (typeof data.phone === "string") {
    const phone = normalizePhone(data.phone);
    if (!phone) return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
    data.phone = phone;
  }
  if (data.designation && !DESIGNATIONS.includes(data.designation as (typeof DESIGNATIONS)[number])) {
    delete data.designation;
  }
  const des =
    (data.designation as string | undefined) || existing.designation;
  if (parsed.data.assemblyName != null || parsed.data.assemblies != null || parsed.data.designation != null) {
    const normalized = normalizeUserAssemblies(
      des,
      (parsed.data.assemblyName as string | undefined) ?? existing.assemblyName,
      parsed.data.assemblies ?? existing.assemblies
    );
    if (des === "ALC" && normalized.assemblies.length < 1) {
      return NextResponse.json({ error: "ALC users need at least one mapped assembly." }, { status: 400 });
    }
    data.assemblyName = normalized.assemblyName;
    data.assemblies = normalized.assemblies;
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
  if (!isSuperAdmin(s.admin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || !canSeeUser(s.admin, existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.user.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
