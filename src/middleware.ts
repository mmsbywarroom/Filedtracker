import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const USER_COOKIE = "ft_user_session";
const ADMIN_COOKIE = "ft_admin_session";
const LEGACY_COOKIE = "ft_session";

type UserTok = { role: "user"; kind: "field" | "rally" } | null;

async function userTokFromCookie(req: NextRequest, name: string): Promise<UserTok> {
  const token = req.cookies.get(name)?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret || secret.length < 16) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if ((payload as { role?: string }).role !== "user") return null;
    const kind = (payload as { kind?: string }).kind === "rally" ? "rally" : "field";
    return { role: "user", kind };
  } catch {
    return null;
  }
}

async function roleFromCookie(req: NextRequest, name: string, expected: "admin") {
  const token = req.cookies.get(name)?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret || secret.length < 16) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return (payload as { role?: string }).role === expected ? expected : null;
  } catch {
    return null;
  }
}

async function userTokFrom(req: NextRequest) {
  const direct = await userTokFromCookie(req, USER_COOKIE);
  if (direct) return direct;
  return userTokFromCookie(req, LEGACY_COOKIE);
}

async function adminRoleFrom(req: NextRequest) {
  const direct = await roleFromCookie(req, ADMIN_COOKIE, "admin");
  if (direct) return direct;
  return roleFromCookie(req, LEGACY_COOKIE, "admin");
}

export async function middleware(req: NextRequest) {
  const userTok = await userTokFrom(req);
  const adminRole = await adminRoleFrom(req);
  const { pathname } = req.nextUrl;
  const ua = req.headers.get("user-agent") || "";
  const nativeWebView = ua.includes("AAPNative/");
  const staffWeb = req.nextUrl.searchParams.get("staff") === "1";
  // Temporary: iPhone Safari web until TestFlight external is live. Android stays APK-only.
  const iosBrowser = /iPhone|iPad|iPod/i.test(ua) && !nativeWebView;
  const fieldWebOk = nativeWebView || staffWeb || iosBrowser;

  if (pathname.startsWith("/dashboard")) {
    if (!fieldWebOk) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (userTok?.role !== "user") return NextResponse.redirect(new URL("/", req.url));
    if (userTok.kind === "rally") return NextResponse.redirect(new URL("/rally", req.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/rally")) {
    if (userTok?.role !== "user") return NextResponse.redirect(new URL("/", req.url));
    if (userTok.kind !== "rally") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (adminRole !== "admin") return NextResponse.redirect(new URL("/admin/login", req.url));
    return NextResponse.next();
  }

  if (pathname === "/") {
    if (userTok?.role === "user" && !req.nextUrl.searchParams.has("relogin")) {
      if (userTok.kind === "rally") {
        return NextResponse.redirect(new URL("/rally", req.url));
      }
      // iOS / native field session → dashboard; Android browser stays on APK landing.
      if (userTok.kind === "field" && fieldWebOk) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }
    return NextResponse.next();
  }

  if (pathname === "/admin/login") {
    if (adminRole === "admin") return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/rally/:path*", "/admin/:path*"],
};
