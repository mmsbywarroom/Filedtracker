import { NextResponse } from "next/server";
import { getAdminSession, getUserSession } from "@/lib/auth";
import { googleMapsKey } from "@/lib/runtimeEnv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [user, admin] = await Promise.all([getUserSession(), getAdminSession()]);
  if (!user && !admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = googleMapsKey();
  return NextResponse.json({ key, hasKey: key.length > 10 });
}
