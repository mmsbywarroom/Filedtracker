import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeFaceImage } from "@/lib/faceImage";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const descriptor = body?.descriptor;
  const samples = Array.isArray(body?.samples) ? (body.samples as number[][]) : null;
  const faceImage = sanitizeFaceImage(body?.image);

  const list: number[][] = [];
  if (samples?.length) {
    for (const d of samples) {
      if (Array.isArray(d) && d.length >= 64) list.push(d);
    }
  } else if (Array.isArray(descriptor) && descriptor.length >= 64) {
    list.push(descriptor);
  }

  if (!list.length) {
    return NextResponse.json({ error: "Face could not be captured. Try again in good light." }, { status: 400 });
  }

  if (list.length < 3) {
    return NextResponse.json(
      { error: "Hold still with your full face in the frame for a few seconds, then try again." },
      { status: 400 }
    );
  }

  // Store up to 3 samples so later punches work across light/angle/phone differences
  const toStore = list.slice(0, 3);

  await prisma.user.update({
    where: { id: s.sub },
    data: {
      faceDescriptorJson: JSON.stringify(toStore),
      faceImage,
      faceRegisteredAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
