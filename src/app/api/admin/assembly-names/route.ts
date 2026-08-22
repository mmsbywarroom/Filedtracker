import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listOfficialAssemblies } from "@/lib/assemblyGeofence";

export async function GET() {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const assemblies = listOfficialAssemblies()
    .map((a) => a.acName)
    .sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ assemblies });
}
