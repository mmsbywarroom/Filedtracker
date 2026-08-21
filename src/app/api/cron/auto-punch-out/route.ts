import { NextResponse } from "next/server";
import { autoPunchOutAllStale } from "@/lib/punchOut";

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const url = new URL(req.url);
  const q = url.searchParams.get("secret") || "";
  if (secret && (bearer === secret || q === secret)) return true;
  // Vercel Cron invokes with this header when CRON_SECRET is not required
  if (req.headers.get("x-vercel-cron") === "1") return true;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  return false;
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
