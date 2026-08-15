import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  return NextResponse.json({ key });
}
