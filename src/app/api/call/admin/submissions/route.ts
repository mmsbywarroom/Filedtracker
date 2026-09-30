import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCallScriptLabel, TEXT_QUESTION_TYPES, type CallQuestion } from "@/lib/callForm";
import { loadCallForm } from "@/lib/callFormStore";

const PAGE_SIZE = 50;

const FIXED_FILTERS = ["when", "caller", "halka", "villageWard", "name", "phone", "age", "gender", "position", "status", "remarks"] as const;

function answerText(question: CallQuestion | undefined, answers: Record<string, string>, id: string) {
  const raw = answers[id] || "";
  if (!raw) return "";
  const parts = raw.split("|").filter(Boolean);
  const labels = parts.map((part) => question?.options.find((o) => o.value === part)?.label || part);
  const label = labels.join(", ");
  const extra = [answers[`${id}__text`], ...parts.map((part) => answers[`${id}__${part}__text`])].filter(Boolean).join("; ");
  return extra ? `${label}: ${extra}` : label;
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export async function GET(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const form = await loadCallForm();
  const questionById = new Map(form.questions.map((q) => [q.id, q]));
  const questions = form.questions
    .filter((q) => !isCallScriptLabel(q.label, form))
    .map((q) => ({
      id: q.id,
      label: q.label,
      type: q.type,
      options: q.options.map((o) => ({ value: o.value, label: o.label })),
    }));
  const allowed = new Set<string>([...FIXED_FILTERS, ...questions.map((q) => q.id)]);

  const wheres: Prisma.Sql[] = [Prisma.sql`TRUE`];
  for (const [key, raw] of url.searchParams.entries()) {
    const value = raw.trim();
    if (!value || key === "page" || !allowed.has(key)) continue;
    const pattern = likePattern(value);
    if (key === "when") {
      wheres.push(Prisma.sql`to_char(r."createdAt" AT TIME ZONE 'Asia/Kolkata', 'FMDD/FMMM/YYYY, HH12:MI:SS am') ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "caller") {
      wheres.push(Prisma.sql`r."callerPhone" ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "halka") {
      wheres.push(Prisma.sql`c.halka ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "villageWard") {
      wheres.push(Prisma.sql`c."villageWard" ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "name") {
      wheres.push(Prisma.sql`c.name ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "phone") {
      wheres.push(Prisma.sql`c.phone ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "age") {
      wheres.push(Prisma.sql`c.age ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "gender") {
      wheres.push(Prisma.sql`c.gender ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "position") {
      wheres.push(Prisma.sql`c.position ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "remarks") {
      wheres.push(Prisma.sql`r.remarks ILIKE ${pattern} ESCAPE '\\'`);
    } else if (key === "status") {
      const matched = form.statuses.filter((st) => st.label.toLowerCase().includes(value.toLowerCase()) || st.value.toLowerCase().includes(value.toLowerCase()));
      wheres.push(
        matched.length
          ? Prisma.sql`(r.status ILIKE ${pattern} ESCAPE '\\' OR r.status IN (${Prisma.join(matched.map((st) => st.value))}))`
          : Prisma.sql`r.status ILIKE ${pattern} ESCAPE '\\'`
      );
    } else {
      const question = questionById.get(key);
      const optionValues = (question?.options || [])
        .filter((o) => o.label.toLowerCase().includes(value.toLowerCase()) || o.value.toLowerCase().includes(value.toLowerCase()))
        .map((o) => o.value);
      wheres.push(
        optionValues.length
          ? Prisma.sql`(COALESCE(r.answers ->> ${key}, '') ILIKE ${pattern} ESCAPE '\\' OR COALESCE(r.answers ->> ${key}, '') IN (${Prisma.join(optionValues)}))`
          : Prisma.sql`COALESCE(r.answers ->> ${key}, '') ILIKE ${pattern} ESCAPE '\\'`
      );
    }
  }
  const where = Prisma.join(wheres, " AND ");
  const skip = (page - 1) * PAGE_SIZE;

  const totalRow = await prisma.$queryRaw<Array<{ n: number }>>`
    WITH latest AS (
      SELECT DISTINCT ON ("contactId") *
      FROM "CallPortalResponse"
      ORDER BY "contactId", "createdAt" DESC
    )
    SELECT COUNT(*)::int AS n
    FROM latest r
    JOIN "CallContact" c ON c.id = r."contactId"
    WHERE ${where}
  `;
  const pageIds = await prisma.$queryRaw<Array<{ contactId: string }>>`
    WITH latest AS (
      SELECT DISTINCT ON ("contactId") *
      FROM "CallPortalResponse"
      ORDER BY "contactId", "createdAt" DESC
    )
    SELECT r."contactId"
    FROM latest r
    JOIN "CallContact" c ON c.id = r."contactId"
    WHERE ${where}
    ORDER BY r."createdAt" DESC
    LIMIT ${PAGE_SIZE} OFFSET ${skip}
  `;
  const total = Number(totalRow[0]?.n || 0);
  const ids = pageIds.map((row) => row.contactId);
  const responses = ids.length
    ? await prisma.callPortalResponse.findMany({
        where: { contactId: { in: ids } },
        orderBy: { createdAt: "desc" },
        include: { contact: true },
      })
    : [];

  const latestByContact = new Map<string, (typeof responses)[number]>();
  for (const row of responses) {
    if (!latestByContact.has(row.contactId)) latestByContact.set(row.contactId, row);
  }

  const rows = ids.flatMap((id) => {
    const row = latestByContact.get(id);
    if (!row) return [];
    const stored = (row.answers as Record<string, unknown>) || {};
    const rawAnswers: Record<string, string> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith("__") || typeof value !== "string") continue;
      rawAnswers[key] = value;
    }
    const c = row.contact;
    return [
      {
        id: row.contactId,
        createdAt: row.createdAt,
        callerPhone: row.callerPhone,
        status: row.status,
        statusLabel: form.statuses.find((st) => st.value === row.status)?.label || row.status,
        remarks: row.remarks,
        halka: c.halka,
        villageWard: c.villageWard,
        name: c.name,
        phone: c.phone,
        age: c.age,
        gender: c.gender,
        position: c.position,
        rawAnswers,
        answers: Object.fromEntries(questions.map((q) => [q.id, answerText(questionById.get(q.id), rawAnswers, q.id)])),
      },
    ];
  });

  return NextResponse.json({
    questions,
    statuses: form.statuses,
    rows,
    page,
    pageSize: PAGE_SIZE,
    total,
  });
}

export async function PATCH(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const contactId = String(body?.contactId || "");
  const status = String(body?.status || "").trim();
  const remarks = String(body?.remarks || "").slice(0, 2000);
  const answers = body?.answers && typeof body.answers === "object" ? (body.answers as Record<string, unknown>) : {};
  if (!contactId || !status) return NextResponse.json({ error: "Call status is required." }, { status: 400 });

  const form = await loadCallForm();
  if (!form.statuses.some((st) => st.value === status)) {
    return NextResponse.json({ error: "Choose a call status." }, { status: 400 });
  }
  const payload: Record<string, string> = {};
  for (const question of form.questions) {
    const value = typeof answers[question.id] === "string" ? answers[question.id].trim() : "";
    if (value) payload[question.id] = value.slice(0, 500);
    if (!TEXT_QUESTION_TYPES.has(question.type)) {
      for (const option of question.options) {
        const textKey = `${question.id}__${option.value}__text`;
        const extra = typeof answers[textKey] === "string" ? answers[textKey].trim() : "";
        if (extra) payload[textKey] = extra.slice(0, 500);
      }
    }
    const textKey = `${question.id}__text`;
    const extra = typeof answers[textKey] === "string" ? answers[textKey].trim() : "";
    if (extra) payload[textKey] = extra.slice(0, 500);
  }

  const previous = await prisma.callPortalResponse.findMany({
    where: { contactId },
    orderBy: { createdAt: "asc" },
    select: { id: true, callerPhone: true },
  });
  const latest = previous[previous.length - 1];
  if (!latest) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  await prisma.callPortalResponse.update({
    where: { id: latest.id },
    data: { status, remarks, answers: payload as Prisma.InputJsonValue, createdAt: new Date() },
  });
  const extra = previous.slice(0, -1).map((row) => row.id);
  if (extra.length) await prisma.callPortalResponse.deleteMany({ where: { id: { in: extra } } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contactId = new URL(req.url).searchParams.get("contactId") || "";
  if (!contactId) return NextResponse.json({ error: "Choose a submission." }, { status: 400 });
  const deleted = await prisma.callPortalResponse.deleteMany({ where: { contactId } });
  if (!deleted.count) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
