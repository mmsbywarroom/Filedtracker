import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Native apps report Always / While-using location permission for admin audit. */
export async function POST(req: Request) {
  const s = await requireUser(req);
  if (!s || s.kind === "rally") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const foreground = Boolean(body?.foreground);
  const background = Boolean(body?.background);
  const platformRaw = String(body?.platform || "").toLowerCase();
  const platform =
    platformRaw === "ios" || platformRaw === "android"
      ? platformRaw
      : req.headers.get("user-agent")?.includes("iPhone") ||
          req.headers.get("user-agent")?.includes("iPad")
        ? "ios"
        : "android";

  await prisma.user.update({
    where: { id: s.sub },
    data: {
      locationForeground: foreground,
      locationBackground: background && foreground,
      locationPermAt: new Date(),
      locationPermPlatform: platform,
    },
  });

  return NextResponse.json({
    ok: true,
    foreground,
    background: background && foreground,
  });
}
