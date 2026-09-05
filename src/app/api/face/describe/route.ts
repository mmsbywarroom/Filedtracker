import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { describeFaceFromImage } from "@/lib/faceDescribeServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Face models can be slow on cold start. */
export const maxDuration = 60;

/** Native app sends a JPEG; server returns face-api.js 128-d descriptor (same as web). */
export async function POST(req: Request) {
  try {
    const s = await requireUser(req);
    if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => null);
    const image = typeof body?.image === "string" ? body.image : "";
    if (!image || image.length < 100) {
      return NextResponse.json({ error: "Face image is required." }, { status: 400 });
    }

    // Native punch already locked a face in-camera — prefer fast detector passes.
    const fast = body?.fast !== false;
    const result = await describeFaceFromImage(image, { relaxed: true, fast });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      descriptor: result.descriptor,
      samples: result.samples,
    });
  } catch (e) {
    console.error("[face-describe]", e);
    return NextResponse.json(
      { error: "Face check failed. Hold still and try again." },
      { status: 500 }
    );
  }
}
