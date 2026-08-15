import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env["GOOGLE_MAPS_API_KEY"] || "";
  return NextResponse.json({ key, hasKey: key.length > 10 });
}
