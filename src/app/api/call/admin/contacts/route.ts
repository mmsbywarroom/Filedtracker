import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decodeCsvBytes, importCallCsv } from "@/lib/callCsv";
import { normalizePhone } from "@/lib/security";

async function guard() {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

function callerMobile(raw: string) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const phone = normalizePhone(trimmed) || trimmed.replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 12) return null;
  return phone.length === 12 && phone.startsWith("91") ? phone.slice(2) : phone;
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
  });
  const ids = contacts.map((c) => c.id);
  const latest = ids.length
    ? await prisma.$queryRaw<Array<{ contactId: string; status: string }>>`
        SELECT DISTINCT ON ("contactId") "contactId", "status"
        FROM "CallPortalResponse"
        WHERE "contactId" IN (${Prisma.join(ids)})
        ORDER BY "contactId", "createdAt" DESC
      `
    : [];
  const statusById = new Map(latest.map((r) => [r.contactId, r.status]));

  const agents = await prisma.user.findMany({
    where: { designation: "Call Center", isActive: true },
    select: { name: true, phone: true },
    orderBy: { name: "asc" },
  });

  const halkaRows = await prisma.callContact.groupBy({
    by: ["halka"],
    _count: { _all: true },
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
      status: statusById.get(c.id) || "",
    })),
    callers: callers
      .map((c) => ({ phone: c.assigneePhone, assigned: c._count._all }))
      .sort((a, b) => b.assigned - a.assigned),
    agents: agents.map((u) => ({ name: u.name, phone: u.phone })),
    halkas: halkaRows
      .map((row) => ({ name: row.halka, count: row._count._all }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  });
}

export async function PATCH(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  const halka = typeof body?.halka === "string" ? body.halka : null;
  const assigneePhone = callerMobile(String(body?.assigneePhone || ""));
  if (assigneePhone === null) return NextResponse.json({ error: "Enter a valid caller mobile." }, { status: 400 });
  if (halka !== null && !id) {
    const updated = await prisma.callContact.updateMany({
      where: { halka },
      data: { assigneePhone },
    });
    return NextResponse.json({ ok: true, assigneePhone, updated: updated.count });
  }
  if (!id) return NextResponse.json({ error: "Choose a contact." }, { status: 400 });
  const contact = await prisma.callContact.findUnique({ where: { id }, select: { id: true } });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  await prisma.callContact.update({ where: { id }, data: { assigneePhone } });
  return NextResponse.json({ ok: true, assigneePhone });
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
