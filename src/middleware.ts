import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

async function roleFrom(req: NextRequest) {
  const token = req.cookies.get("ft_session")?.value;
  const secret = process.env.JWT_SECRET;
  if (!token || !secret || secret.length < 16) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return (payload as { role?: string }).role || null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const role = await roleFrom(req);
  const { pathname } = req.nextUrl;

  if (role === "user" && (pathname === "/" || pathname.startsWith("/admin"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (role === "admin" && (pathname === "/" || pathname === "/admin/login")) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  if (!role && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  if (!role && pathname.startsWith("/admin") && pathname !== "/admin/login") {
    return NextResponse.redirect(new URL("/admin/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/admin/:path*"],
};
