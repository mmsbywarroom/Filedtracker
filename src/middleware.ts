import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const USER_COOKIE = "ft_user_session";
const ADMIN_COOKIE = "ft_admin_session";
const LEGACY_COOKIE = "ft_session";

async function roleFromCookie(req: NextRequest, name: string, expected: "user" | "admin") {
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

async function userRoleFrom(req: NextRequest) {
  const direct = await roleFromCookie(req, USER_COOKIE, "user");
  if (direct) return direct;
  return roleFromCookie(req, LEGACY_COOKIE, "user");
}

async function adminRoleFrom(req: NextRequest) {
  const direct = await roleFromCookie(req, ADMIN_COOKIE, "admin");
  if (direct) return direct;
  return roleFromCookie(req, LEGACY_COOKIE, "admin");
}

export async function middleware(req: NextRequest) {
  const userRole = await userRoleFrom(req);
  const adminRole = await adminRoleFrom(req);
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard")) {
    if (userRole !== "user") return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (adminRole !== "admin") return NextResponse.redirect(new URL("/admin/login", req.url));
    return NextResponse.next();
  }

  if (pathname === "/") {
    // ?relogin=1 skips bounce while session is being cleared
    if (userRole === "user" && !req.nextUrl.searchParams.has("relogin")) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
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
  matcher: ["/", "/dashboard/:path*", "/admin/:path*"],
};
