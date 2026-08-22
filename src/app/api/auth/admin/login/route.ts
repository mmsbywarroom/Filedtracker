import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setAdminSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/security";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`admin-login:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required." }, { status: 400 });
  }

  const admin = await prisma.admin.findUnique({ where: { email } });
  if (!admin) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });

  await setAdminSessionCookie({ sub: admin.id, name: admin.name || "Admin" });
  return NextResponse.json({ ok: true });
}
