import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, normalizePhone } from "@/lib/security";

export async function POST(req: Request) {
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

  const otp = generateOtp();
  await prisma.otpChallenge.create({
    data: { phone, codeHash: hashOtp(phone, otp), expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
  return NextResponse.json({ ok: true, otp, message: "OTP is shown on this screen. No SMS is sent." });
}
