import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, normalizePhone, rateLimit } from "@/lib/security";

const COOLDOWN_MS = 60 * 1000;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`call-otp-ip:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many OTP requests from this network. Wait 15 minutes.", retryAfter: 900 }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone || ""));
  if (!phone) return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });

  const assigned = await prisma.callContact.findFirst({
    where: { assigneePhone: phone },
    select: { id: true },
  });
  if (!assigned) {
    return NextResponse.json({ error: "This number has no assigned calls. Contact admin." }, { status: 404 });
  }

  const phoneRl = rateLimit(`call-otp-phone:${phone}`, 3, 15 * 60 * 1000);
  if (!phoneRl.ok) {
    return NextResponse.json({ error: "Too many OTPs for this number. Wait 15 minutes.", retryAfter: 900 }, { status: 429 });
  }

  const last = await prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  if (last && Date.now() - last.createdAt.getTime() < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000);
    return NextResponse.json({ error: `OTP already created. Wait ${waitSec}s.`, retryAfter: waitSec }, { status: 429 });
  }

  const otp = generateOtp();
  await prisma.otpChallenge.create({
    data: { phone, codeHash: hashOtp(phone, otp), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  return NextResponse.json({ ok: true, otp, message: "OTP is shown on this screen. No SMS is sent." });
}
