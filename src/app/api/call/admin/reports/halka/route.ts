import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCallAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CONNECTED_CALL_STATUSES, NOT_CONNECTED_CALL_STATUSES } from "@/lib/callList";
import { isCallScriptLabel, type CallQuestion } from "@/lib/callForm";
import { loadCallForm } from "@/lib/callFormStore";
import { CANONICAL_HALKAS, canonicalCallHalka } from "@/lib/assemblyHalkaCodes";

function isChoice(question: CallQuestion) {
  return question.type === "yes_no" || question.type === "single" || question.type === "dropdown";
}

function isYesToken(text: string) {
  return /^(yes|ਹਾਂ|हां|हाँ)\b/i.test(text.trim()) || /(^|[\s(])(yes|ਹਾਂ|हां|हाँ)([\s)]|$)/i.test(text.trim());
}

function isNoToken(text: string) {
  return /^(no|ਨਹੀਂ|नहीं)\b/i.test(text.trim()) || /(^|[\s(])(no|ਨਹੀਂ|नहीं)([\s)]|$)/i.test(text.trim());
}

function choiceValues(question: CallQuestion | undefined, kind: "yes" | "no") {
  const fallback = kind === "yes" ? ["yes"] : ["no"];
  if (!question) return fallback;
  const values = question.options
    .filter((option) => {
      const yes = isYesToken(option.value) || isYesToken(option.label);
      const no = isNoToken(option.value) || isNoToken(option.label);
      if (kind === "yes") return yes && !no;
      return no && !yes;
    })
    .map((option) => option.value);
  return values.length ? values : fallback;
}

function questionNumber(label: string) {
  const match = label.trim().match(/^q\s*(\d+(?:\.\d+)?)/i);
  return match ? match[1] : "";
}

function findCoordinator(questions: CallQuestion[]) {
  return (
    questions.find((question) => questionNumber(question.label) === "2") ||
    questions.find((question) => isChoice(question) && /coordinator|ਕੋਆਰਡੀਨੇਟ|कोऑर्डिनेटर/i.test(question.label))
  );
}

function findFollowUp(questions: CallQuestion[], parent?: CallQuestion) {
  const numbered = questions.find((question) => questionNumber(question.label) === "2.1");
  if (numbered) return numbered;
  if (!parent) return undefined;
  const noValues = new Set(choiceValues(parent, "no"));
  const linked = new Set<string>();
  for (const option of parent.options) {
    if (!noValues.has(option.value)) continue;
    for (const id of option.showQuestionIds || []) linked.add(id);
  }
  return (
    questions.find((question) => question.id !== parent.id && isChoice(question) && linked.has(question.id)) ||
    questions.find((question) => question.showIf?.questionId === parent.id && noValues.has(question.showIf.equals) && isChoice(question))
  );
}

function findVillage(questions: CallQuestion[], skipId?: string) {
  return (
    questions.find((question) => question.id !== skipId && questionNumber(question.label) === "3") ||
    questions.find(
      (question) =>
        question.id !== skipId &&
        isChoice(question) &&
        /village match|ਪਿੰਡ|ਵਾਰਡ ਦਾ ਨਾਮ|village\s*\/\s*ward|ward name|village name|विलेज का नाम|गाँव/i.test(question.label)
    )
  );
}

export async function GET() {
  const session = await getCallAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await loadCallForm();
  const listed = form.questions.filter((question) => !isCallScriptLabel(question.label, form));
  const coordinator = findCoordinator(listed);
  const followUp = findFollowUp(listed, coordinator);
  const village = findVillage(listed, coordinator?.id);
  const connected = Prisma.join([...CONNECTED_CALL_STATUSES]);
  const notConnected = Prisma.join([...NOT_CONNECTED_CALL_STATUSES]);
  const coordYes = Prisma.join(choiceValues(coordinator, "yes"));
  const coordNo = Prisma.join(choiceValues(coordinator, "no"));
  const followYes = Prisma.join(choiceValues(followUp, "yes"));
  const followNo = Prisma.join(choiceValues(followUp, "no"));
  const villageYes = Prisma.join(choiceValues(village, "yes"));
  const villageNo = Prisma.join(choiceValues(village, "no"));
  const coordId = coordinator?.id || "";
  const followId = followUp?.id || "";
  const villageId = village?.id || "";
  const q2Yes = Prisma.sql`${coordId} <> '' AND l.answers ->> ${coordId} IN (${coordYes})`;
  const q2No = Prisma.sql`${coordId} <> '' AND l.answers ->> ${coordId} IN (${coordNo})`;
  const coordinatorYes = followId
    ? Prisma.sql`(${q2Yes} OR (${q2No} AND ${followId} <> '' AND l.answers ->> ${followId} IN (${followYes})))`
    : Prisma.sql`(${q2Yes})`;
  const coordinatorNo = followId
    ? Prisma.sql`(${q2No} AND ${followId} <> '' AND l.answers ->> ${followId} IN (${followNo}))`
    : Prisma.sql`(${q2No})`;

  const rows = await prisma.$queryRaw<
    Array<{
      zone: string;
      halka: string;
      total: number;
      dialed: number;
      notAttempted: number;
      connected: number;
      complete: number;
      notConnected: number;
      coordinatorYes: number;
      coordinatorNo: number;
      villageYes: number;
      villageNo: number;
    }>
  >`
    WITH latest AS (
      SELECT DISTINCT ON ("contactId") "contactId", status, answers
      FROM "CallPortalResponse"
      ORDER BY "contactId", "createdAt" DESC
    )
    SELECT
      c.zone,
      c.halka,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(l.status, '') <> '')::int AS dialed,
      COUNT(*) FILTER (WHERE COALESCE(l.status, '') = '')::int AS "notAttempted",
      COUNT(*) FILTER (WHERE l.status IN (${connected}))::int AS connected,
      COUNT(*) FILTER (WHERE l.status = 'call_complete')::int AS complete,
      COUNT(*) FILTER (WHERE l.status IN (${notConnected}))::int AS "notConnected",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorYes})::int AS "coordinatorYes",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorNo})::int AS "coordinatorNo",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorYes} AND ${villageId} <> '' AND l.answers ->> ${villageId} IN (${villageYes}))::int AS "villageYes",
      COUNT(*) FILTER (WHERE l.status = 'call_complete' AND ${coordinatorYes} AND ${villageId} <> '' AND l.answers ->> ${villageId} IN (${villageNo}))::int AS "villageNo"
    FROM "CallContact" c
    LEFT JOIN latest l ON l."contactId" = c.id
    GROUP BY c.zone, c.halka
    ORDER BY c.zone ASC, c.halka ASC
  `;

  type Counts = Omit<(typeof rows)[number], "zone" | "halka">;
  const empty = (): Counts => ({
    total: 0,
    dialed: 0,
    notAttempted: 0,
    connected: 0,
    complete: 0,
    notConnected: 0,
    coordinatorYes: 0,
    coordinatorNo: 0,
    villageYes: 0,
    villageNo: 0,
  });
  const byHalka = new Map<string, Counts>();
  for (const row of rows) {
    const canonical = canonicalCallHalka(row.halka);
    if (!canonical) continue;
    const current = byHalka.get(canonical.halka) || empty();
    current.total += Number(row.total || 0);
    current.dialed += Number(row.dialed || 0);
    current.notAttempted += Number(row.notAttempted || 0);
    current.connected += Number(row.connected || 0);
    current.complete += Number(row.complete || 0);
    current.notConnected += Number(row.notConnected || 0);
    current.coordinatorYes += Number(row.coordinatorYes || 0);
    current.coordinatorNo += Number(row.coordinatorNo || 0);
    current.villageYes += Number(row.villageYes || 0);
    current.villageNo += Number(row.villageNo || 0);
    byHalka.set(canonical.halka, current);
  }

  return NextResponse.json({
    coordinatorLabel: coordinator?.label || "Village coordinator",
    villageLabel: village?.label || "Village match",
    rows: CANONICAL_HALKAS.map((item) => ({
      zone: item.zone,
      halka: item.halka,
      ...(byHalka.get(item.halka) || empty()),
    })),
  });
}
