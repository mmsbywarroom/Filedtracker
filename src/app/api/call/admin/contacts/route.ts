import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decodeCsvBytes, importCallCsv } from "@/lib/callCsv";

async function guard() {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function GET(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  const digits = q.replace(/\D/g, "");
  const contacts = await prisma.callContact.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { halka: { contains: q, mode: "insensitive" } },
            { villageWard: { contains: q, mode: "insensitive" } },
            { zone: { contains: q, mode: "insensitive" } },
            { district: { contains: q, mode: "insensitive" } },
            { assigneePhone: { contains: digits || q } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {},
    orderBy: { updatedAt: "desc" },
    take: 2000,
    include: { portalResponses: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
  });

  const callers = await prisma.callContact.groupBy({
    by: ["assigneePhone"],
    where: { assigneePhone: { not: "" } },
    _count: { _all: true },
  });

  return NextResponse.json({
    contacts: contacts.map((c) => ({
      id: c.id,
      zone: c.zone,
      district: c.district,
      halka: c.halka,
      villageWard: c.villageWard,
      block: c.block,
      name: c.name,
      phone: c.phone,
      age: c.age,
      gender: c.gender,
      education: c.education,
      position: c.position,
      fatherName: c.fatherName,
      assigneePhone: c.assigneePhone,
      status: c.portalResponses[0]?.status || "",
    })),
    callers: callers
      .map((c) => ({ phone: c.assigneePhone, assigned: c._count._all }))
      .sort((a, b) => b.assigned - a.assigned),
  });
}

export async function POST(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  const text = decodeCsvBytes(Buffer.from(await file.arrayBuffer()));
  const result = await importCallCsv(text);
  if ("error" in result && result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function DELETE(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  if (new URL(req.url).searchParams.get("all") !== "1") {
    return NextResponse.json({ error: "Confirm delete all." }, { status: 400 });
  }
  const deleted = await prisma.callContact.deleteMany();
  return NextResponse.json({ ok: true, deleted: deleted.count });
}
