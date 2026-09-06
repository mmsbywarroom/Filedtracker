import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, hashOtp, normalizePhone, rateLimit } from "@/lib/security";
import { sendOtpSms } from "@/lib/sms";
import { parseClientSource } from "@/lib/clientSource";

const COOLDOWN_MS = 90 * 1000;
const MAX_PER_PHONE_HOUR = 3;
const MAX_PER_IP_HOUR = 8;
const MAX_IP_BURST = 4;

function blockedPhones(): Set<string> {
  const raw = process.env.OTP_BLOCKED_PHONES || "";
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((p) => normalizePhone(p))
      .filter((p): p is string => Boolean(p))
  );
}

type DeviceOwner = {
  deviceOwnerUserId: string;
  deviceOwnerName: string;
  deviceOwnerPhone: string;
};

/** Resolve who previously used this install / Android ID (may differ from OTP target). */
async function resolveDeviceOwner(
  appInstallationId: string,
  androidId: string
): Promise<DeviceOwner> {
  const empty: DeviceOwner = {
    deviceOwnerUserId: "",
    deviceOwnerName: "",
    deviceOwnerPhone: "",
  };

  try {
    if (appInstallationId) {
      const install = await prisma.deviceAppInstallation.findFirst({
        where: { appInstallationId },
        orderBy: { lastSeenAt: "desc" },
      });
      if (install) {
        const u = await prisma.user.findUnique({
          where: { id: install.userId },
          select: { id: true, name: true, phone: true },
        });
        if (u) {
          return {
            deviceOwnerUserId: u.id,
            deviceOwnerName: u.name,
            deviceOwnerPhone: u.phone,
          };
        }
      }
    }

    if (androidId) {
      const prior = await prisma.otpRequestLog.findFirst({
        where: {
          androidId,
          OR: [
            { deviceOwnerUserId: { not: "" } },
            { outcome: "sent" },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
      if (prior?.deviceOwnerUserId) {
        return {
          deviceOwnerUserId: prior.deviceOwnerUserId,
          deviceOwnerName: prior.deviceOwnerName,
          deviceOwnerPhone: prior.deviceOwnerPhone,
        };
      }
      if (prior?.phone) {
        const u = await prisma.user.findUnique({
          where: { phone: prior.phone },
          select: { id: true, name: true, phone: true },
        });
        if (u) {
          return {
            deviceOwnerUserId: u.id,
            deviceOwnerName: u.name,
            deviceOwnerPhone: u.phone,
          };
        }
      }
    }
  } catch {
    // never block OTP on lookup failure
  }

  return empty;
}

async function logOtpRequest(data: {
  phone: string;
  outcome: string;
  detail?: string;
  ip: string;
  userAgent: string;
  clientSource: string;
  appInstallationId?: string;
  androidId?: string;
  appVersion?: string;
  manufacturer?: string;
  model?: string;
  deviceOwnerUserId?: string;
  deviceOwnerName?: string;
  deviceOwnerPhone?: string;
}) {
  try {
    await prisma.otpRequestLog.create({
      data: {
        phone: data.phone,
        outcome: data.outcome,
        detail: (data.detail || "").slice(0, 400),
        ip: (data.ip || "").slice(0, 80),
        userAgent: (data.userAgent || "").slice(0, 400),
        clientSource: data.clientSource.slice(0, 20),
        appInstallationId: (data.appInstallationId || "").slice(0, 128),
        androidId: (data.androidId || "").slice(0, 64),
        appVersion: (data.appVersion || "").slice(0, 40),
        manufacturer: (data.manufacturer || "").slice(0, 80),
        model: (data.model || "").slice(0, 80),
        deviceOwnerUserId: (data.deviceOwnerUserId || "").slice(0, 64),
        deviceOwnerName: (data.deviceOwnerName || "").slice(0, 120),
        deviceOwnerPhone: (data.deviceOwnerPhone || "").slice(0, 20),
      },
    });
  } catch {
    // never fail OTP path on logging
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const userAgent = req.headers.get("user-agent") || "";
  const clientSource = parseClientSource(req);

  const rlIp = rateLimit(`otp:${ip}`, MAX_IP_BURST, 15 * 60 * 1000);
  if (!rlIp.ok) {
    return NextResponse.json({ error: "Too many OTP requests. Try later." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone || ""));
  const appInstallationId = String(body?.appInstallationId || body?.clientId || "").trim();
  const androidId = String(body?.androidId || "").trim();
  const appVersion = String(body?.appVersion || "").trim();
  const manufacturer = String(body?.manufacturer || "").trim();
  const model = String(body?.model || "").trim();

  const owner = await resolveDeviceOwner(appInstallationId, androidId);

  const meta = {
    ip,
    userAgent,
    clientSource,
    appInstallationId,
    androidId,
    appVersion,
    manufacturer,
    model,
    ...owner,
  };

  if (!phone) {
    return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
  }

  if (blockedPhones().has(phone)) {
    await logOtpRequest({
      phone,
      outcome: "blocked_disabled",
      detail: "Phone temporarily blocked via OTP_BLOCKED_PHONES",
      ...meta,
    });
    return NextResponse.json(
      { error: "OTP temporarily disabled for this number. Contact admin." },
      { status: 403 }
    );
  }

  const field = await prisma.user.findUnique({ where: { phone } });
  const rally = field ? null : await prisma.rallyUser.findUnique({ where: { phone } });
  if ((!field || !field.isActive) && (!rally || !rally.isActive)) {
    await logOtpRequest({
      phone,
      outcome: "blocked_unknown",
      detail: "Number not registered / inactive",
      ...meta,
    });
    return NextResponse.json({ error: "This number is not registered. Contact admin." }, { status: 404 });
  }

  // In-memory burst (single instance) + DB cooldown (multi-instance safe)
  const rlPhone = rateLimit(`otp-phone:${phone}`, 1, COOLDOWN_MS);
  if (!rlPhone.ok) {
    await logOtpRequest({
      phone,
      outcome: "blocked_cooldown",
      detail: "In-memory cooldown",
      ...meta,
    });
    return NextResponse.json(
      { error: "OTP already sent. Wait about 90 seconds before requesting again." },
      { status: 429 }
    );
  }

  const last = await prisma.otpChallenge.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (last) {
    const age = Date.now() - last.createdAt.getTime();
    if (age < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - age) / 1000);
      await logOtpRequest({
        phone,
        outcome: "blocked_cooldown",
        detail: `DB cooldown wait=${waitSec}s`,
        ...meta,
      });
      return NextResponse.json(
        { error: `OTP already sent. Wait ${waitSec}s before requesting again.` },
        { status: 429 }
      );
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const hourCount = await prisma.otpChallenge.count({
    where: { phone, createdAt: { gt: hourAgo } },
  });
  if (hourCount >= MAX_PER_PHONE_HOUR) {
    await logOtpRequest({
      phone,
      outcome: "blocked_hourly",
      detail: `phone hourCount=${hourCount}`,
      ...meta,
    });
    return NextResponse.json(
      { error: "Too many OTPs for this number (max 3/hour). Try again later." },
      { status: 429 }
    );
  }

  const ipHourSent = await prisma.otpRequestLog.count({
    where: {
      ip,
      outcome: "sent",
      createdAt: { gt: hourAgo },
    },
  });
  if (ip && ip !== "local" && ipHourSent >= MAX_PER_IP_HOUR) {
    await logOtpRequest({
      phone,
      outcome: "blocked_ip",
      detail: `ip hour sent=${ipHourSent}`,
      ...meta,
    });
    return NextResponse.json(
      { error: "Too many OTP requests from this network. Try later." },
      { status: 429 }
    );
  }

  // Drop expired challenge rows only — keep recent for hourly caps.
  await prisma.otpChallenge.deleteMany({
    where: { expiresAt: { lt: new Date() } },
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
    await prisma.otpChallenge.deleteMany({
      where: { phone, createdAt: { gt: new Date(Date.now() - 10_000) } },
    });
    await logOtpRequest({
      phone,
      outcome: "sms_failed",
      detail: e instanceof Error ? e.message.slice(0, 200) : "sms failed",
      ...meta,
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not send OTP" },
      { status: 502 }
    );
  }

  const mismatch =
    Boolean(field && owner.deviceOwnerUserId && owner.deviceOwnerUserId !== field.id);
  await logOtpRequest({
    phone,
    outcome: "sent",
    detail: field
      ? `otpTarget=${field.id}${mismatch ? ` deviceOwner=${owner.deviceOwnerUserId}` : owner.deviceOwnerUserId ? "" : " device=unknown"}`
      : `rally=${rally?.id || ""}`,
    ...meta,
  });

  return NextResponse.json({ ok: true, message: "OTP sent", cooldownSec: 90 });
}
