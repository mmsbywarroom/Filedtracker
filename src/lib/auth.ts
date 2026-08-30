import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { AdminScope } from "@/lib/hierarchy";
import { normalizeAccessLevel } from "@/lib/hierarchy";

const USER_COOKIE = "ft_user_session";
const ADMIN_COOKIE = "ft_admin_session";
/** @deprecated legacy single cookie — cleared on new login */
const LEGACY_COOKIE = "ft_session";

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string;
  role: "admin" | "user";
  kind?: "field" | "rally";
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

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

async function writeCookie(name: string, token: string) {
  cookies().set(name, token, cookieOpts(60 * 60 * 24 * 30));
}

async function eraseCookie(name: string) {
  cookies().set(name, "", cookieOpts(0));
}

async function readSessionCookie(name: string): Promise<SessionPayload | null> {
  const token = cookies().get(name)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

async function legacySession(): Promise<SessionPayload | null> {
  return readSessionCookie(LEGACY_COOKIE);
}

export async function setUserSessionCookie(payload: Omit<SessionPayload, "role">) {
  const token = await signSession({ ...payload, role: "user" });
  await writeCookie(USER_COOKIE, token);
  await eraseCookie(LEGACY_COOKIE);
}

export async function setAdminSessionCookie(payload: Omit<SessionPayload, "role">) {
  const token = await signSession({ ...payload, role: "admin" });
  await writeCookie(ADMIN_COOKIE, token);
  await eraseCookie(LEGACY_COOKIE);
}

/** @deprecated use setUserSessionCookie or setAdminSessionCookie */
export async function setSessionCookie(payload: SessionPayload) {
  if (payload.role === "admin") await setAdminSessionCookie(payload);
  else await setUserSessionCookie(payload);
}

export async function clearUserSession() {
  await eraseCookie(USER_COOKIE);
  await eraseCookie(LEGACY_COOKIE);
}

export async function clearAdminSession() {
  await eraseCookie(ADMIN_COOKIE);
  await eraseCookie(LEGACY_COOKIE);
}

/** @deprecated use clearUserSession or clearAdminSession */
export async function clearSession() {
  await clearUserSession();
  await clearAdminSession();
}

export async function getUserSession(): Promise<SessionPayload | null> {
  const direct = await readSessionCookie(USER_COOKIE);
  if (direct?.role === "user") return direct;
  const legacy = await legacySession();
  if (legacy?.role === "user") return legacy;
  return null;
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const direct = await readSessionCookie(ADMIN_COOKIE);
  if (direct?.role === "admin") return direct;
  const legacy = await legacySession();
  if (legacy?.role === "admin") return legacy;
  return null;
}

/** User app session only (admin panel uses getAdminSession). */
export async function getSession(): Promise<SessionPayload | null> {
  return getUserSession();
}

export async function requireUser() {
  const s = await getUserSession();
  if (!s || s.role !== "user" || s.kind === "rally") return null;
  return s;
}

export async function requireRallyUser() {
  const s = await getUserSession();
  if (!s || s.role !== "user") return null;
  if (s.kind && s.kind !== "rally") return null;
  const user = await prisma.rallyUser.findFirst({
    where: { id: s.sub, isActive: true },
    include: { rally: true },
  });
  if (!user) return null;
  return { session: s, user };
}

export async function requireAdmin() {
  const s = await getAdminSession();
  if (!s || s.role !== "admin") return null;
  const admin = await prisma.admin.findUnique({ where: { id: s.sub } });
  if (!admin) return null;
  const scope: AdminScope = {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    accessLevel: normalizeAccessLevel(admin.accessLevel) || admin.accessLevel,
    isSuper: admin.isSuper,
    designations: admin.designations,
    zone: admin.zone,
    district: admin.district,
    assemblyName: admin.assemblyName,
    assemblies: admin.assemblies || [],
    cluster: admin.cluster,
  };
  return { ...s, admin: scope };
}
