import { NextResponse } from "next/server";
import { autoPunchOutAllStale } from "@/lib/punchOut";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !secret) {
    console.error("[cron] CRON_SECRET is required in production");
    return false;
  }

  if (!secret) {
    return !isProd;
  }

  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const url = new URL(req.url);
  const q = url.searchParams.get("secret") || "";
  return bearer === secret || q === secret;
}

/** Cron / manual: auto punch-out sessions open longer than 12 hours. */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const closed = await autoPunchOutAllStale(300);
    return NextResponse.json({
      ok: true,
      closed: closed.length,
      ids: closed.map((c) => c.id),
    });
  } catch (e) {
    console.error("auto-punch-out cron", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
