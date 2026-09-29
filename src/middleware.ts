import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { isRallyPublicHost } from "@/lib/rallyHost";
import { isCallPublicHost } from "@/lib/callHost";

const USER_COOKIE = "ft_user_session";
const ADMIN_COOKIE = "ft_admin_session";
const LEGACY_COOKIE = "ft_session";
const CALLER_COOKIE = "ft_caller_session";
const CALL_ADMIN_COOKIE = "ft_call_admin_session";

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

async function roleFromCookie(req: NextRequest, name: string, expected: "admin" | "caller" | "calladmin") {
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
  const host = req.headers.get("host");
  const rallyHost = isRallyPublicHost(host);
  const ua = req.headers.get("user-agent") || "";
  const nativeWebView = ua.includes("AAPNative/");
  const mobileBrowser =
    (/Android|iPhone|iPad|iPod/i.test(ua) && !nativeWebView) || false;
  // Desktop escape only — never unlock phone browser web punch (Android or Safari) on filed host.
  const staffWeb =
    req.nextUrl.searchParams.get("staff") === "1" && !mobileBrowser;
  const fieldWebOk = nativeWebView || staffWeb;

  const callHost = isCallPublicHost(host);

  if (callHost && (pathname.startsWith("/admin") || pathname.startsWith("/dashboard") || pathname.startsWith("/rally"))) {
    return NextResponse.redirect(new URL("/call", req.url));
  }
  if (callHost && pathname === "/") {
    const caller = await roleFromCookie(req, CALLER_COOKIE, "caller");
    return NextResponse.redirect(new URL(caller ? "/call/desk" : "/call", req.url));
  }

  if (pathname.startsWith("/call/desk")) {
    const caller = await roleFromCookie(req, CALLER_COOKIE, "caller");
    if (!caller) return NextResponse.redirect(new URL("/call", req.url));
  }
  if (pathname.startsWith("/call/admin") && pathname !== "/call/admin/login") {
    const callAdmin = await roleFromCookie(req, CALL_ADMIN_COOKIE, "calladmin");
    if (!callAdmin) return NextResponse.redirect(new URL("/call/admin/login", req.url));
  }
  if (pathname === "/call/admin/login") {
    const callAdmin = await roleFromCookie(req, CALL_ADMIN_COOKIE, "calladmin");
    if (callAdmin) return NextResponse.redirect(new URL("/call/admin", req.url));
  }

  // --- Rally public host: login + /rally only (no field dashboard / admin) ---
  if (rallyHost) {
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      if (userTok?.kind === "rally") {
        return NextResponse.redirect(new URL("/rally", req.url));
      }
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (pathname.startsWith("/rally")) {
      if (userTok?.role !== "user") return NextResponse.redirect(new URL("/", req.url));
      if (userTok.kind !== "rally") return NextResponse.redirect(new URL("/", req.url));
      return NextResponse.next();
    }
    if (pathname === "/") {
      if (userTok?.role === "user" && userTok.kind === "rally" && !req.nextUrl.searchParams.has("relogin")) {
        return NextResponse.redirect(new URL("/rally", req.url));
      }
      return NextResponse.next();
    }
    return NextResponse.next();
  }

  // --- Filed host (existing rules) ---
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
      // Only native app / desktop staff web may open field dashboard.
      if (userTok.kind === "field" && fieldWebOk) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
      // Phone browser with old cookie → stay on download landing.
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
  matcher: ["/", "/dashboard/:path*", "/rally/:path*", "/admin/:path*", "/call/:path*"],
};
