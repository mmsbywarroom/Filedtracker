import { NextResponse } from "next/server";
import { clearAdminSession, clearUserSession } from "@/lib/auth";

export async function POST(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope");
  if (scope === "admin") await clearAdminSession();
  else await clearUserSession();
  return NextResponse.json({ ok: true });
}
