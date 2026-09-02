import { NextResponse } from "next/server";
import { getUserSessionFromRequest, signSession } from "@/lib/auth";

/** Returns JWT for native background GPS (Capacitor app). WebView calls this after OTP login. */
export async function GET(req: Request) {
  const s = await getUserSessionFromRequest(req);
  if (!s || s.role !== "user" || s.kind === "rally") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await signSession({
    sub: s.sub,
    phone: s.phone,
    name: s.name,
    kind: s.kind,
    role: "user",
  });

  const host = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return NextResponse.json({
    token,
    apiBaseUrl: host || "",
    userId: s.sub,
  });
}
