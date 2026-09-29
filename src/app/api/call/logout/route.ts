import { NextResponse } from "next/server";
import { clearCallerSession } from "@/lib/auth";

export async function POST() {
  await clearCallerSession();
  return NextResponse.json({ ok: true });
}
