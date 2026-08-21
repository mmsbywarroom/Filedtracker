import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listOfficialAssemblies, resolveAssemblyFeature } from "@/lib/assemblyGeofence";

/** Super/admin diagnostic: which user assemblies map to which polygons */
export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    select: { assemblyName: true },
    distinct: ["assemblyName"],
    orderBy: { assemblyName: "asc" },
  });
  const official = listOfficialAssemblies();
  const mapped = users.map((u) => {
    const match = resolveAssemblyFeature(u.assemblyName);
    return {
      appName: u.assemblyName,
      matched: Boolean(match),
      mapName: match?.acName || null,
      acNo: match?.acNo || null,
    };
  });
  return NextResponse.json({
    officialCount: official.length,
    appAssemblies: mapped,
    unmatched: mapped.filter((m) => !m.matched),
  });
}
