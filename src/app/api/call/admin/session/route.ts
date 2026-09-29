import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { clearCallAdminSession, getCallAdminSession, setCallAdminSession } from "@/lib/auth";

function creds() {
  return {
    user: process.env.CALL_PORTAL_ADMIN_USER || "calladmin",
    pass: process.env.CALL_PORTAL_ADMIN_PASSWORD || "AapCall2026",
  };
}

function same(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = String(body?.username || "").trim();
  const password = String(body?.password || "");
  const expected = creds();
  if (!same(username, expected.user) || !same(password, expected.pass)) {
    return NextResponse.json({ error: "Incorrect user ID or password." }, { status: 401 });
  }
  await setCallAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearCallAdminSession();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const s = await getCallAdminSession();
  return NextResponse.json({ ok: Boolean(s) });
}
