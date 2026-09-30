import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCallScriptLabel, type CallQuestion } from "@/lib/callForm";
import { loadCallForm, loadQuestionLabels } from "@/lib/callFormStore";

const PAGE_SIZE = 50;

function answerText(question: CallQuestion | undefined, answers: Record<string, string>, id: string) {
  const raw = answers[id] || "";
  if (!raw) return "";
  const parts = raw.split("|").filter(Boolean);
  const labels = parts.map((part) => question?.options.find((o) => o.value === part)?.label || part);
  const label = labels.join(", ");
  const extra = [answers[`${id}__text`], ...parts.map((part) => answers[`${id}__${part}__text`])].filter(Boolean).join("; ");
  return extra ? `${label}: ${extra}` : label;
}

function isAnswerKey(key: string) {
  return Boolean(key) && key !== "__labels" && !key.startsWith("__") && !key.includes("__text");
}

export async function GET(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const page = Math.max(1, Number(new URL(req.url).searchParams.get("page") || 1) || 1);
  const form = await loadCallForm();
  const archived = await loadQuestionLabels();
  const questionById = new Map(form.questions.map((q) => [q.id, q]));

  const [totalRow, keyRows, labelRows] = await Promise.all([
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM (
        SELECT "contactId" FROM "CallPortalResponse" GROUP BY "contactId"
      ) grouped
    `,
    prisma.$queryRaw<Array<{ key: string }>>`
      SELECT DISTINCT key
      FROM "CallPortalResponse" r,
      LATERAL jsonb_object_keys(r.answers) AS key
    `,
    prisma.$queryRaw<Array<{ key: string; value: string }>>`
      SELECT t.key, MAX(t.value) AS value
      FROM "CallPortalResponse" r
      CROSS JOIN LATERAL jsonb_each_text(
        CASE
          WHEN jsonb_typeof(r.answers->'__labels') = 'object' THEN r.answers->'__labels'
          ELSE '{}'::jsonb
        END
      ) AS t(key, value)
      GROUP BY t.key
    `,
  ]);

  const total = Number(totalRow[0]?.n || 0);
  const labels: Record<string, string> = { ...archived };
  for (const row of labelRows) {
    if (row.key && row.value && !labels[row.key]) labels[row.key] = row.value;
  }
  for (const q of form.questions) labels[q.id] = q.label;

  const seen = new Set<string>();
  const columns: { id: string; label: string; current: boolean }[] = [];
  function addColumn(id: string, current: boolean) {
    if (!isAnswerKey(id) || seen.has(id)) return;
    const label = labels[id] || "Earlier question";
    if (isCallScriptLabel(label, form)) return;
    seen.add(id);
    columns.push({ id, label, current });
  }
  for (const q of form.questions) addColumn(q.id, true);
  for (const row of keyRows) addColumn(row.key, false);

  const pageIds = await prisma.$queryRaw<Array<{ contactId: string }>>`
    SELECT "contactId"
    FROM "CallPortalResponse"
    GROUP BY "contactId"
    ORDER BY MAX("createdAt") DESC
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
  `;
  const ids = pageIds.map((row) => row.contactId);
  const responses = ids.length
    ? await prisma.callPortalResponse.findMany({
        where: { contactId: { in: ids } },
        orderBy: { createdAt: "asc" },
        include: { contact: true },
      })
    : [];

  const byContact = new Map<string, (typeof responses)[number] & { merged: Record<string, string> }>();
  for (const row of responses) {
    const stored = (row.answers as Record<string, unknown>) || {};
    const prev = byContact.get(row.contactId);
    const merged = { ...(prev?.merged || {}) };
    for (const [key, value] of Object.entries(stored)) {
      if (key === "__labels" || typeof value !== "string") continue;
      if (value || !(key in merged)) merged[key] = value;
      else if (value === "" && questionById.has(key)) merged[key] = "";
    }
    byContact.set(row.contactId, Object.assign(row, { merged }));
  }

  const rows = ids.flatMap((id) => {
    const row = byContact.get(id);
    if (!row) return [];
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
        answers: Object.fromEntries(columns.map((q) => [q.id, answerText(questionById.get(q.id), row.merged, q.id)])),
      },
    ];
  });

  return NextResponse.json({
    questions: columns,
    rows,
    page,
    pageSize: PAGE_SIZE,
    total,
  });
}
