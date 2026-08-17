import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function euclidean(a: number[], b: number[]) {
  if (a.length !== b.length) return 99;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const descriptor = body?.descriptor as number[] | undefined;
  if (!Array.isArray(descriptor)) {
    return NextResponse.json({ error: "Face not detected." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: s.sub } });
  if (!user?.faceDescriptorJson) {
    return NextResponse.json({ error: "Register your face first." }, { status: 400 });
  }
  const stored = JSON.parse(user.faceDescriptorJson) as number[];
  const dist = euclidean(stored, descriptor);
  // Same person with angle/light change is often 0.4–0.55; different people usually >0.6.
  const matched = dist < 0.56;
  return NextResponse.json({ matched, distance: Number(dist.toFixed(4)) });
}
