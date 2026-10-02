import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCallScriptLabel, TEXT_QUESTION_TYPES, type CallQuestion } from "@/lib/callForm";
import { loadCallForm } from "@/lib/callFormStore";
import { canonicalCallHalka } from "@/lib/assemblyHalkaCodes";
import { halkaReportPredicates, isHalkaMetric, type HalkaMetric } from "@/lib/halkaReportMatch";
import type { CallFormShape } from "@/lib/callForm";

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

function whenLabel(iso: string) {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${Number(day)}/${Number(month)}/${year}`;
}

const BLANK = "__blank__";

function anyOf(parts: Prisma.Sql[]) {
  if (parts.length === 1) return parts[0];
  return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

function textIn(column: Prisma.Sql, values: string[]) {
  const parts: Prisma.Sql[] = [];
  if (values.includes(BLANK)) parts.push(Prisma.sql`btrim(COALESCE(${column}, '')) = ''`);
  const concrete = values.filter((value) => value !== BLANK);
  if (concrete.length) parts.push(Prisma.sql`btrim(COALESCE(${column}, '')) IN (${Prisma.join(concrete)})`);
  return parts.length ? anyOf(parts) : null;
}

function whenIn(values: string[]) {
  const parts: Prisma.Sql[] = [];
  if (values.includes(BLANK)) parts.push(Prisma.sql`r."createdAt" IS NULL`);
  const dates = values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  if (dates.length) {
    parts.push(
      Prisma.sql`(r."createdAt" AT TIME ZONE 'Asia/Kolkata')::date IN (${Prisma.join(dates.map((day) => Prisma.sql`${day}::date`))})`
    );
  }
  return parts.length ? anyOf(parts) : null;
}

function answerIn(id: string, values: string[]) {
  const parts: Prisma.Sql[] = [];
  if (values.includes(BLANK)) parts.push(Prisma.sql`btrim(COALESCE(r.answers ->> ${id}, '')) = ''`);
  for (const value of values) {
    if (value === BLANK) continue;
    const wrapped = `%|${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}|%`;
    parts.push(Prisma.sql`btrim(COALESCE(r.answers ->> ${id}, '')) = ${value}`);
    parts.push(Prisma.sql`('|' || COALESCE(r.answers ->> ${id}, '') || '|') ILIKE ${wrapped} ESCAPE '\\'`);
  }
  return parts.length ? anyOf(parts) : null;
}

async function drillHalka(
  url: URL,
  metric: HalkaMetric,
  form: CallFormShape,
  questions: Array<{ id: string; label: string; type: CallQuestion["type"]; options: Array<{ value: string; label: string }> }>,
  questionById: Map<string, CallQuestion>
) {
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const halka = url.searchParams.get("halka")?.trim() || "";
  const zone = url.searchParams.get("zone")?.trim() || "";
  const raw = url.searchParams.get("raw") === "1";
  const { metricWhere } = halkaReportPredicates(form);
  let halkaSql = Prisma.sql`TRUE`;
  if (halka && raw) {
    const zoneSql = zone === "Unlisted" ? Prisma.sql`btrim(COALESCE(c.zone, '')) = ''` : Prisma.sql`c.zone = ${zone}`;
    const nameSql = halka === "No halka" ? Prisma.sql`btrim(COALESCE(c.halka, '')) = ''` : Prisma.sql`c.halka = ${halka}`;
    halkaSql = Prisma.sql`${zoneSql} AND ${nameSql}`;
  } else if (halka) {
    const distinct = await prisma.callContact.findMany({ distinct: ["halka"], select: { halka: true } });
    const names = distinct.map((row) => row.halka).filter((name) => canonicalCallHalka(name)?.halka === halka);
    halkaSql = names.length ? Prisma.sql`c.halka IN (${Prisma.join(names)})` : Prisma.sql`FALSE`;
  }
  const skip = (page - 1) * PAGE_SIZE;
  const where = Prisma.sql`${halkaSql} AND (${metricWhere[metric]})`;
  const totalRow = await prisma.$queryRaw<Array<{ n: number }>>`
    WITH latest AS (
      SELECT DISTINCT ON ("contactId") "contactId", status, answers
      FROM "CallPortalResponse"
      ORDER BY "contactId", "createdAt" DESC
    )
    SELECT COUNT(*)::int AS n
    FROM "CallContact" c
    LEFT JOIN latest l ON l."contactId" = c.id
    WHERE ${where}
  `;
  const pageIds = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH latest AS (
      SELECT DISTINCT ON ("contactId") "contactId", status, answers, "createdAt"
      FROM "CallPortalResponse"
      ORDER BY "contactId", "createdAt" DESC
    )
    SELECT c.id
    FROM "CallContact" c
    LEFT JOIN latest l ON l."contactId" = c.id
    WHERE ${where}
    ORDER BY l."createdAt" DESC NULLS LAST, c.name ASC
    LIMIT ${PAGE_SIZE} OFFSET ${skip}
  `;
  const ids = pageIds.map((row) => row.id);
  const contacts = ids.length
    ? await prisma.callContact.findMany({ where: { id: { in: ids } } })
    : [];
  const responses = ids.length
    ? await prisma.callPortalResponse.findMany({
        where: { contactId: { in: ids } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
  const latestByContact = new Map<string, (typeof responses)[number]>();
  for (const row of responses) {
    if (!latestByContact.has(row.contactId)) latestByContact.set(row.contactId, row);
  }
  const rows = ids.flatMap((id) => {
    const c = contactById.get(id);
    if (!c) return [];
    const row = latestByContact.get(id);
    const stored = (row?.answers as Record<string, unknown>) || {};
    const rawAnswers: Record<string, string> = {};
    for (const [key, value] of Object.entries(stored)) {
      if (key.startsWith("__") || typeof value !== "string") continue;
      rawAnswers[key] = value;
    }
    return [
      {
        id: c.id,
        createdAt: row?.createdAt || null,
        callerPhone: row?.callerPhone || c.assigneePhone,
        status: row?.status || "",
        statusLabel: row ? form.statuses.find((st) => st.value === row.status)?.label || row.status : "Not attempted",
        remarks: row?.remarks || "",
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
    total: Number(totalRow[0]?.n || 0),
    metric,
    halka,
  });
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

  if (url.searchParams.get("lists") === "1") {
    const distinct = await prisma.$queryRaw<Array<{ kind: string; value: string }>>`
      WITH latest AS (
        SELECT DISTINCT ON ("contactId") "contactId", "callerPhone", remarks, "createdAt"
        FROM "CallPortalResponse"
        ORDER BY "contactId", "createdAt" DESC
      ),
      joined AS (
        SELECT
          to_char(r."createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
          btrim(r."callerPhone") AS caller,
          btrim(c.halka) AS halka,
          btrim(c."villageWard") AS "villageWard",
          btrim(c.name) AS name,
          btrim(c.phone) AS phone,
          btrim(c.age) AS age,
          btrim(c.gender) AS gender,
          btrim(c.position) AS position,
          btrim(r.remarks) AS remarks
        FROM latest r
        JOIN "CallContact" c ON c.id = r."contactId"
      )
      SELECT 'when' AS kind, day AS value FROM joined
      UNION SELECT 'caller', caller FROM joined
      UNION SELECT 'halka', halka FROM joined
      UNION SELECT 'villageWard', "villageWard" FROM joined
      UNION SELECT 'name', name FROM joined
      UNION SELECT 'phone', phone FROM joined
      UNION SELECT 'age', age FROM joined
      UNION SELECT 'gender', gender FROM joined
      UNION SELECT 'position', position FROM joined
      UNION SELECT 'remarks', remarks FROM joined
    `;
    const textIds = questions.filter((q) => TEXT_QUESTION_TYPES.has(q.type)).map((q) => q.id);
    const answerRows = textIds.length
      ? await prisma.$queryRaw<Array<{ id: string; value: string }>>`
          WITH latest AS (
            SELECT DISTINCT ON ("contactId") answers
            FROM "CallPortalResponse"
            ORDER BY "contactId", "createdAt" DESC
          )
          SELECT q.id, btrim(r.answers ->> q.id) AS value
          FROM latest r
          CROSS JOIN (VALUES ${Prisma.join(textIds.map((id) => Prisma.sql`(${id})`))}) AS q(id)
          WHERE btrim(COALESCE(r.answers ->> q.id, '')) <> ''
          GROUP BY q.id, btrim(r.answers ->> q.id)
        `
      : [];
    const grouped = new Map<string, Set<string>>();
    for (const row of distinct) {
      const value = String(row.value || "").trim();
      if (!value) continue;
      const bucket = grouped.get(row.kind) || new Set<string>();
      bucket.add(value);
      grouped.set(row.kind, bucket);
    }
    for (const row of answerRows) {
      const value = String(row.value || "").trim();
      if (!value) continue;
      const bucket = grouped.get(row.id) || new Set<string>();
      bucket.add(value);
      grouped.set(row.id, bucket);
    }
    const options: Record<string, Array<{ value: string; label: string }>> = {};
    grouped.forEach((values, key) => {
      const items: Array<{ value: string; label: string }> = [];
      values.forEach((value) => {
        items.push({ value, label: key === "when" ? whenLabel(value) : value });
      });
      items.sort((a, b) => (key === "when" ? b.value.localeCompare(a.value) : a.label.localeCompare(b.label)));
      options[key] = items;
    });
    options.status = form.statuses.map((st) => ({ value: st.value, label: st.label }));
    for (const question of questions) {
      if (TEXT_QUESTION_TYPES.has(question.type) || !question.options.length) continue;
      options[question.id] = question.options.map((option) => ({ value: option.value, label: option.label }));
    }
    return NextResponse.json({ options });
  }

  const metric = url.searchParams.get("metric")?.trim() || "";
  if (isHalkaMetric(metric)) {
    return drillHalka(url, metric, form, questions, questionById);
  }

  const selected = new Map<string, string[]>();
  for (const [key, raw] of url.searchParams.entries()) {
    const value = raw.trim();
    if (!value || key === "page" || key === "lists" || !allowed.has(key)) continue;
    const list = selected.get(key) || [];
    if (!list.includes(value)) list.push(value);
    selected.set(key, list);
  }
  const wheres: Prisma.Sql[] = [Prisma.sql`TRUE`];
  selected.forEach((values, key) => {
    let clause: Prisma.Sql | null = null;
    if (key === "when") clause = whenIn(values);
    else if (key === "caller") clause = textIn(Prisma.sql`r."callerPhone"`, values);
    else if (key === "halka") clause = textIn(Prisma.sql`c.halka`, values);
    else if (key === "villageWard") clause = textIn(Prisma.sql`c."villageWard"`, values);
    else if (key === "name") clause = textIn(Prisma.sql`c.name`, values);
    else if (key === "phone") clause = textIn(Prisma.sql`c.phone`, values);
    else if (key === "age") clause = textIn(Prisma.sql`c.age`, values);
    else if (key === "gender") clause = textIn(Prisma.sql`c.gender`, values);
    else if (key === "position") clause = textIn(Prisma.sql`c.position`, values);
    else if (key === "remarks") clause = textIn(Prisma.sql`r.remarks`, values);
    else if (key === "status") clause = textIn(Prisma.sql`r.status`, values);
    else clause = answerIn(key, values);
    if (clause) wheres.push(clause);
  });
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
