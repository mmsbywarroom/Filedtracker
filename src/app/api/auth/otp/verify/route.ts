import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setUserSessionCookie } from "@/lib/auth";
import { hashOtp, normalizePhone, OTP_LENGTH, rateLimit, safeEqual } from "@/lib/security";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`otp-verify:${ip}`, 20, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone || ""));
  const code = String(body?.otp || "").trim();
  if (!phone || !new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code)) {
    return NextResponse.json({ error: "Invalid OTP." }, { status: 400 });
  }

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge || challenge.expiresAt < new Date()) {
    return NextResponse.json({ error: "OTP expired. Request a new one." }, { status: 400 });
  }
  if (challenge.attempts >= 5) {
    await prisma.otpChallenge.delete({ where: { id: challenge.id } });
    return NextResponse.json({ error: "Too many wrong OTPs. Request again." }, { status: 400 });
  }

  const ok = safeEqual(challenge.codeHash, hashOtp(phone, code));
  if (!ok) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "Incorrect OTP." }, { status: 400 });
  }

  const field = await prisma.user.findUnique({ where: { phone } });
  const rally = field ? null : await prisma.rallyUser.findUnique({ where: { phone } });
  const account = field?.isActive
    ? { id: field.id, phone: field.phone, name: field.name, kind: "field" as const }
    : rally?.isActive
      ? { id: rally.id, phone: rally.phone, name: rally.name, kind: "rally" as const }
      : null;
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  await prisma.otpChallenge.delete({ where: { id: challenge.id } });
  await setUserSessionCookie({
    sub: account.id,
    phone: account.phone,
    name: account.name,
    kind: account.kind,
  });
  return NextResponse.json({ ok: true, kind: account.kind });
}
