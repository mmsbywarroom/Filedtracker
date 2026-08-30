import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, normalizePhone, rateLimit } from "@/lib/security";
import { sendOtpSms } from "@/lib/sms";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`otp:${ip}`, 8, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many OTP requests. Try later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone || ""));
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  const field = await prisma.user.findUnique({ where: { phone } });
  const rally = field ? null : await prisma.rallyUser.findUnique({ where: { phone } });
  if ((!field || !field.isActive) && (!rally || !rally.isActive)) {
    return NextResponse.json({ error: "This number is not registered. Contact admin." }, { status: 404 });
  }

  await prisma.otpChallenge.deleteMany({
    where: { OR: [{ phone }, { expiresAt: { lt: new Date() } }] },
  });

  const otp = generateOtp();
  await prisma.otpChallenge.create({
    data: {
      phone,
      codeHash: hashOtp(phone, otp),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  try {
    await sendOtpSms(phone, otp);
  } catch (e) {
    await prisma.otpChallenge.deleteMany({ where: { phone } });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send OTP" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, message: "OTP sent" });
}
