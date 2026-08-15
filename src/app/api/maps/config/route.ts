import { NextResponse } from "next/server";
import { googleMapsKey } from "@/lib/runtimeEnv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const key = googleMapsKey();
  return NextResponse.json({ key, hasKey: key.length > 10 });
}
