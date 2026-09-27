import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_OUTCOMES, isCallOutcome } from "@/lib/callList";

export async function GET(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: s.sub },
    select: { name: true },
  });
  const rows = await prisma.callAssignment.findMany({
    where: { userId: s.sub },
    include: {
      contact: { select: { id: true, name: true, phone: true, vehicleNumber: true } },
    },
    orderBy: { contact: { name: "asc" } },
  });
  const outcomes = await prisma.callOutcome.findMany({
    where: { userId: s.sub },
    select: { contactId: true, status: true, attending: true, companions: true },
  });
  const outcomeByContact = new Map(outcomes.map((o) => [o.contactId, o]));
  const byStatus = Object.fromEntries(CALL_OUTCOMES.map((o) => [o.value, 0]));
  for (const o of outcomes) {
    if (o.status in byStatus) byStatus[o.status] += 1;
  }

  return NextResponse.json({
    callerName: me?.name || "",
    summary: {
      assigned: rows.length,
      called: outcomes.filter((o) => o.status).length,
      coming: outcomes.filter((o) => o.attending === "coming").length,
      notComing: outcomes.filter((o) => o.attending === "not_coming").length,
      byStatus,
    },
    outcomes: CALL_OUTCOMES,
    contacts: rows.map((row, index) => {
      const saved = outcomeByContact.get(row.contact.id);
      return {
        id: row.contact.id,
        serial: index + 1,
        name: row.contact.name,
        phone: row.contact.phone,
        vehicleNumber: row.contact.vehicleNumber,
        outcome: saved?.status || "",
        attending: saved?.attending || "",
        companions: saved?.companions || "",
      };
    }),
  });
}

const patchSchema = z.object({
  contactId: z.string().min(1),
  status: z.string().optional(),
  attending: z.string().optional(),
  companions: z.string().optional(),
});

export async function PATCH(req: Request) {
  const s = await requireUser(req);
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a call result." }, { status: 400 });
  const { contactId } = parsed.data;
  if (parsed.data.status && !isCallOutcome(parsed.data.status)) {
    return NextResponse.json({ error: "Choose a call result." }, { status: 400 });
  }
  const assigned = await prisma.callAssignment.findUnique({
    where: { userId_contactId: { userId: s.sub, contactId } },
  });
  if (!assigned) return NextResponse.json({ error: "This number is not assigned to you." }, { status: 404 });

  const existing = await prisma.callOutcome.findUnique({
    where: { userId_contactId: { userId: s.sub, contactId } },
  });
  const nextStatus = parsed.data.status || existing?.status || "";
  if (!nextStatus) return NextResponse.json({ error: "Choose a call result." }, { status: 400 });
  const nextAttending =
    parsed.data.attending === undefined
      ? existing?.attending || ""
      : parsed.data.attending === "coming" || parsed.data.attending === "not_coming"
        ? parsed.data.attending
        : "";
  const nextCompanions =
    nextAttending === "coming"
      ? parsed.data.companions === "yes" || parsed.data.companions === "no"
        ? parsed.data.companions
        : parsed.data.companions === undefined
          ? existing?.companions || ""
          : ""
      : "";

  const outcome = await prisma.callOutcome.upsert({
    where: { userId_contactId: { userId: s.sub, contactId } },
    create: {
      userId: s.sub,
      contactId,
      status: nextStatus,
      attending: nextAttending,
      companions: nextCompanions,
    },
    update: { status: nextStatus, attending: nextAttending, companions: nextCompanions },
  });
  return NextResponse.json({ ok: true, outcome: outcome.status, attending: outcome.attending, companions: outcome.companions });
}
