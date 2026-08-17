import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userScopeWhere } from "@/lib/hierarchy";

function uniq(values: (string | null | undefined)[]) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean))).sort();
}

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const users = await prisma.user.findMany({
    where: userScopeWhere(s.admin),
    select: { zone: true, district: true, assemblyName: true, cluster: true },
  });
  return NextResponse.json({
    zones: uniq(users.map((u) => u.zone)),
    districts: uniq(users.map((u) => u.district)),
    assemblies: uniq(users.map((u) => u.assemblyName)),
    clusters: uniq(users.map((u) => u.cluster)),
    places: users.map((u) => ({
      zone: u.zone,
      district: u.district,
      assemblyName: u.assemblyName,
      cluster: u.cluster,
    })),
  });
}
