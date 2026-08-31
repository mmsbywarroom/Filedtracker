import { createHash, randomInt, timingSafeEqual } from "crypto";

export function normalizePhone(raw: string) {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  // Excel often exports mobiles as 6.20E+09 or 9876543210.0
  if (/e/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n > 0) s = String(Math.round(n));
  } else if (/^\d+\.0+$/.test(s)) {
    s = s.replace(/\.0+$/, "");
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return null;
}

export function generateOtp() {
  return String(randomInt(1000, 10000));
}

export function hashOtp(phone: string, code: string) {
  return createHash("sha256").update(`${phone}:${code}:${process.env.JWT_SECRET}`).digest("hex");
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now > cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (cur.count >= limit) return { ok: false, remaining: 0 };
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count };
}
