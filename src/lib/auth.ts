import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "ft_session";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string;
  role: "admin" | "user";
  phone?: string;
  name?: string;
};

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  cookies().set(COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const s = await getSession();
  if (!s || s.role !== "user") return null;
  return s;
}

export async function requireAdmin() {
  const s = await getSession();
  if (!s || s.role !== "admin") return null;
  return s;
}
