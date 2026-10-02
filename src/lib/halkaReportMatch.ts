import { Prisma } from "@prisma/client";
import { CONNECTED_CALL_STATUSES, NOT_CONNECTED_CALL_STATUSES } from "@/lib/callList";
import { isCallScriptLabel, type CallFormShape, type CallQuestion } from "@/lib/callForm";

export const HALKA_METRICS = [
  "total",
  "dialed",
  "notAttempted",
  "connected",
  "complete",
  "notConnected",
  "coordinatorYes",
  "coordinatorNo",
  "villageYes",
  "villageNo",
] as const;

export type HalkaMetric = (typeof HALKA_METRICS)[number];

export function isHalkaMetric(value: string): value is HalkaMetric {
  return (HALKA_METRICS as readonly string[]).includes(value);
}

export const HALKA_METRIC_LABEL: Record<HalkaMetric, string> = {
  total: "Total calls",
  dialed: "Total calls dialed",
  notAttempted: "Calls not yet attempted",
  connected: "Connected calls",
  complete: "Call complete",
  notConnected: "Not connected",
  coordinatorYes: "Question 2 Yes",
  coordinatorNo: "Question 2 No",
  villageYes: "Village match Yes",
  villageNo: "Village match No",
};

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
  const values = new Set<string>();
  for (const option of question.options) {
    const yes = isYesToken(option.value) || isYesToken(option.label);
    const no = isNoToken(option.value) || isNoToken(option.label);
    const match = kind === "yes" ? yes && !no : no && !yes;
    if (!match) continue;
    if (option.value.trim()) values.add(option.value.trim());
    if (option.label.trim()) values.add(option.label.trim());
  }
  return values.size ? Array.from(values) : fallback;
}

function answerIs(id: string, values: string[]) {
  const tokens = Prisma.join(values.map((value) => value.toLowerCase()));
  return Prisma.sql`${id} <> '' AND EXISTS (
    SELECT 1
    FROM unnest(string_to_array(lower(btrim(COALESCE(l.answers ->> ${id}, ''))), '|')) AS part
    WHERE btrim(part) IN (${tokens})
  )`;
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

export function halkaReportPredicates(form: CallFormShape) {
  const listed = form.questions.filter((question) => !isCallScriptLabel(question.label, form));
  const coordinator = findCoordinator(listed);
  const followUp = findFollowUp(listed, coordinator);
  const village = findVillage(listed, coordinator?.id);
  const connected = Prisma.join([...CONNECTED_CALL_STATUSES]);
  const notConnected = Prisma.join([...NOT_CONNECTED_CALL_STATUSES]);
  const followId = followUp?.id || "";
  const q2Yes = answerIs(coordinator?.id || "", choiceValues(coordinator, "yes"));
  const q2No = answerIs(coordinator?.id || "", choiceValues(coordinator, "no"));
  const followYesAnswer = answerIs(followId, choiceValues(followUp, "yes"));
  const coordinatorYes = followId ? Prisma.sql`(${q2Yes} OR (${q2No} AND ${followYesAnswer}))` : Prisma.sql`(${q2Yes})`;
  const coordinatorNo = followId ? Prisma.sql`(${q2No} AND NOT (${followYesAnswer}))` : Prisma.sql`(${q2No})`;
  const villageYes = answerIs(village?.id || "", choiceValues(village, "yes"));
  const villageNo = answerIs(village?.id || "", choiceValues(village, "no"));
  const metricWhere: Record<HalkaMetric, Prisma.Sql> = {
    total: Prisma.sql`TRUE`,
    dialed: Prisma.sql`btrim(COALESCE(l.status, '')) <> ''`,
    notAttempted: Prisma.sql`btrim(COALESCE(l.status, '')) = ''`,
    connected: Prisma.sql`l.status IN (${connected})`,
    complete: Prisma.sql`l.status = 'call_complete'`,
    notConnected: Prisma.sql`l.status IN (${notConnected})`,
    coordinatorYes: Prisma.sql`l.status = 'call_complete' AND ${coordinatorYes}`,
    coordinatorNo: Prisma.sql`l.status = 'call_complete' AND ${coordinatorNo}`,
    villageYes: Prisma.sql`l.status = 'call_complete' AND ${coordinatorYes} AND ${villageYes}`,
    villageNo: Prisma.sql`l.status = 'call_complete' AND ${coordinatorYes} AND ${villageNo}`,
  };
  return {
    coordinatorLabel: coordinator?.label || "Village coordinator",
    villageLabel: village?.label || "Village match",
    connected,
    notConnected,
    coordinatorYes,
    coordinatorNo,
    villageYes,
    villageNo,
    metricWhere,
  };
}
