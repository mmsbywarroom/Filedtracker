import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, normalizePhone, rateLimit } from "@/lib/security";
import { sendOtpSms } from "@/lib/sms";

const COOLDOWN_MS = 45 * 1000;
const MAX_PER_PHONE_HOUR = 5;

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rlIp = rateLimit(`otp:${ip}`, 6, 15 * 60 * 1000);
  if (!rlIp.ok) {
    return NextResponse.json({ error: "Too many OTP requests. Try later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone || ""));
  if (!phone) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  // Per-phone cooldown (in-memory + DB) — stops double-tap / Safari resubmit spam.
  const rlPhone = rateLimit(`otp-phone:${phone}`, 1, COOLDOWN_MS);
  if (!rlPhone.ok) {
    return NextResponse.json(
      { error: "OTP already sent. Wait about 45 seconds before requesting again." },
      { status: 429 }
    );
  }

  const field = await prisma.user.findUnique({ where: { phone } });
  const rally = field ? null : await prisma.rallyUser.findUnique({ where: { phone } });
  if ((!field || !field.isActive) && (!rally || !rally.isActive)) {
    return NextResponse.json({ error: "This number is not registered. Contact admin." }, { status: 404 });
  }

  // Drop expired rows only — keep recent rows so hourly caps work.
  await prisma.otpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  const last = await prisma.otpChallenge.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (last) {
    const age = Date.now() - last.createdAt.getTime();
    if (age < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - age) / 1000);
      return NextResponse.json(
        { error: `OTP already sent. Wait ${waitSec}s before requesting again.` },
        { status: 429 }
      );
    }
  }

  const hourCount = await prisma.otpChallenge.count({
    where: {
      phone,
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (hourCount >= MAX_PER_PHONE_HOUR) {
    return NextResponse.json(
      { error: "Too many OTPs for this number. Try again after some time." },
      { status: 429 }
    );
  }

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
    await prisma.otpChallenge.deleteMany({
      where: { phone, createdAt: { gt: new Date(Date.now() - 10_000) } },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send OTP" },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, message: "OTP sent", cooldownSec: 45 });
}
