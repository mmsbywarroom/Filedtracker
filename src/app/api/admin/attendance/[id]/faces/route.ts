import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeUser } from "@/lib/hierarchy";

type Kind = "registered" | "in" | "out";

/** Load one face image on demand (keeps daily records list fast). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const s = await requireAdmin();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const kind = (new URL(req.url).searchParams.get("kind") || "in") as Kind;
  if (kind !== "registered" && kind !== "in" && kind !== "out") {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }

  const row = await prisma.attendance.findUnique({
    where: { id: params.id },
    select: {
      punchInFace: kind === "in",
      punchOutFace: kind === "out",
      user: {
        select: {
          id: true,
          name: true,
          designation: true,
          zone: true,
          district: true,
          assemblyName: true,
          cluster: true,
          faceImage: kind === "registered",
        },
      },
    },
  });

  if (!row || !canSeeUser(s.admin, row.user)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const image =
    kind === "registered" ? row.user.faceImage : kind === "out" ? row.punchOutFace : row.punchInFace;

  if (!image) {
    return NextResponse.json({ error: "No face image." }, { status: 404 });
  }

  return NextResponse.json({ image, kind, name: row.user.name });
}
