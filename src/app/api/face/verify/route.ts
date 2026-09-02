import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { matchFaceDescriptor, parseStoredDescriptors } from "@/lib/faceMatch";

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const descriptor = body?.descriptor as number[] | undefined;

  const user = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { faceDescriptorJson: true, usesTurban: true },
  });
  if (!user?.faceDescriptorJson) {
    return NextResponse.json({ error: "Register your face first." }, { status: 400 });
  }
  const storedList = parseStoredDescriptors(user.faceDescriptorJson);
  const result = matchFaceDescriptor(storedList, descriptor || [], { turbanMode: user.usesTurban });
  if (!result.ok) {
    return NextResponse.json({
      matched: false,
      distance: Number(result.distance.toFixed(4)),
      hint: result.error,
      error: result.error,
    });
  }
  return NextResponse.json({
    matched: true,
    distance: Number(result.distance.toFixed(4)),
  });
}
