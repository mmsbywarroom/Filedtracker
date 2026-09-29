import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setCallerSession } from "@/lib/auth";
import { hashOtp, normalizePhone, OTP_LENGTH, rateLimit, safeEqual } from "@/lib/security";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`call-otp-verify:${ip}`, 20, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone || ""));
  const code = String(body?.otp || "").trim();
  if (!phone || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
    return NextResponse.json({ error: "Invalid OTP." }, { status: 400 });
  }

  const assigned = await prisma.callContact.findFirst({ where: { assigneePhone: phone }, select: { id: true } });
  if (!assigned) return NextResponse.json({ error: "This number has no assigned calls." }, { status: 404 });

  const challenge = await prisma.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: "desc" } });
  if (!challenge || challenge.expiresAt < new Date()) {
    return NextResponse.json({ error: "OTP expired. Request a new one." }, { status: 400 });
  }
  if (challenge.attempts >= 5) {
    await prisma.otpChallenge.delete({ where: { id: challenge.id } });
    return NextResponse.json({ error: "Too many wrong OTPs. Request again." }, { status: 400 });
  }
  if (!safeEqual(challenge.codeHash, hashOtp(phone, code))) {
    await prisma.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "Incorrect OTP." }, { status: 400 });
  }
  await prisma.otpChallenge.delete({ where: { id: challenge.id } });
  await setCallerSession(phone);
  return NextResponse.json({ ok: true });
}
