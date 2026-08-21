import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function euclidean(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 99;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function parseStored(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === "number") {
      return [parsed as number[]];
    }
    if (Array.isArray(parsed) && parsed.length && Array.isArray(parsed[0])) {
      return (parsed as number[][]).filter((d) => Array.isArray(d) && d.length >= 64);
    }
  } catch {
    /* ignore */
  }
  return [];
}

/** face-api.js FaceMatcher default is 0.6; phones/light change often need a bit more room */
const MATCH_THRESHOLD = 0.62;

export async function POST(req: Request) {
  const s = await requireUser();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const descriptor = body?.descriptor as number[] | undefined;
  if (!Array.isArray(descriptor) || descriptor.length < 64) {
    return NextResponse.json({ error: "Face not detected." }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: s.sub } });
  if (!user?.faceDescriptorJson) {
    return NextResponse.json({ error: "Register your face first." }, { status: 400 });
  }
  const storedList = parseStored(user.faceDescriptorJson);
  if (!storedList.length) {
    return NextResponse.json({ error: "Register your face again." }, { status: 400 });
  }

  let best = 99;
  for (const stored of storedList) {
    const dist = euclidean(stored, descriptor);
    if (dist < best) best = dist;
  }
  const matched = best < MATCH_THRESHOLD;
  return NextResponse.json({
    matched,
    distance: Number(best.toFixed(4)),
    // Hint for support — not shown in UI unless we choose to
    hint: matched
      ? undefined
      : "Face did not match. Stand in good light, look straight, or ask admin to reset face and register again.",
  });
}
