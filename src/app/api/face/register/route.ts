import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitizeFaceImage } from "@/lib/faceImage";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const descriptor = body?.descriptor;
  const faceImage = sanitizeFaceImage(body?.image);
  if (!Array.isArray(descriptor) || descriptor.length < 64) {
    return NextResponse.json({ error: "Face could not be captured. Try again in good light." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: s.sub },
    data: {
      faceDescriptorJson: JSON.stringify(descriptor),
      faceImage,
      faceRegisteredAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true });
}
