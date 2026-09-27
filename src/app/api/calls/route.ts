import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCallOutcome } from "@/lib/callList";

export async function GET(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.callAssignment.findMany({
    where: { userId: s.sub },
    include: {
      contact: { select: { id: true, name: true, phone: true, vehicleNumber: true } },
    },
    orderBy: { contact: { name: "asc" } },
  });
  const outcomes = await prisma.callOutcome.findMany({
    where: { userId: s.sub },
    select: { contactId: true, status: true },
  });
  const outcomeByContact = new Map(outcomes.map((o) => [o.contactId, o.status]));

  return NextResponse.json({
    contacts: rows.map((row, index) => ({
      id: row.contact.id,
      serial: index + 1,
      name: row.contact.name,
      phone: row.contact.phone,
      vehicleNumber: row.contact.vehicleNumber,
      outcome: outcomeByContact.get(row.contact.id) || "",
    })),
  });
}

const patchSchema = z.object({
  contactId: z.string().min(1),
  status: z.string().min(1),
});

export async function PATCH(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isCallOutcome(parsed.data.status)) {
    return NextResponse.json({ error: "Choose a call result." }, { status: 400 });
  }
  const assigned = await prisma.callAssignment.findUnique({
    where: { userId_contactId: { userId: s.sub, contactId: parsed.data.contactId } },
  });
  if (!assigned) return NextResponse.json({ error: "This number is not assigned to you." }, { status: 404 });

  const outcome = await prisma.callOutcome.upsert({
    where: { userId_contactId: { userId: s.sub, contactId: parsed.data.contactId } },
    create: { userId: s.sub, contactId: parsed.data.contactId, status: parsed.data.status },
    update: { status: parsed.data.status },
  });
  return NextResponse.json({ ok: true, outcome: outcome.status });
}
