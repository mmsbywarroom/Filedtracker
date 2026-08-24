import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/security";
import {
  DESIGNATIONS,
  canManageFieldUser,
  canSeeUser,
  clusterUserPayload,
  isClusterAdmin,
  isSuperAdmin,
} from "@/lib/hierarchy";
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
    if (isClusterAdmin(s.admin)) {
      if (!canManageFieldUser(s.admin, existing)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (parsed.data.clearFace) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (keys.length !== 1 || keys[0] !== "isActive") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  const { clearFace, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (clearFace) {
    data.faceDescriptorJson = null;
    data.faceImage = null;
    data.faceRegisteredAt = null;
  }
  if (typeof data.phone === "string") {
    const phone = normalizePhone(data.phone);
    if (!phone) return NextResponse.json({ error: "Invalid mobile number." }, { status: 400 });
    data.phone = phone;
  }
  if (data.designation && !DESIGNATIONS.includes(data.designation as (typeof DESIGNATIONS)[number])) {
    delete data.designation;
  }
  if (isClusterAdmin(s.admin)) {
    const scoped = clusterUserPayload(s.admin, {
      designation: (data.designation as string | undefined) || existing.designation,
      assemblyName: (data.assemblyName as string | undefined) ?? existing.assemblyName,
      zone: (data.zone as string | undefined) ?? existing.zone,
      district: (data.district as string | undefined) ?? existing.district,
      cluster: (data.cluster as string | undefined) ?? existing.cluster,
    });
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: 403 });
    data.designation = scoped.payload.designation;
    data.assemblyName = scoped.payload.assemblyName;
    data.zone = scoped.payload.zone;
    data.district = scoped.payload.district;
    data.cluster = scoped.payload.cluster;
  }
  const des = (data.designation as string | undefined) || existing.designation;
  if (parsed.data.assemblyName != null || parsed.data.assemblies != null || parsed.data.designation != null) {
    const normalized = normalizeUserAssemblies(
      des,
      (data.assemblyName as string | undefined) ?? existing.assemblyName,
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
  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing || !canSeeUser(s.admin, existing)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageFieldUser(s.admin, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.user.delete({ where: { id: params.id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
