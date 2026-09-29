import { CALL_OUTCOMES } from "@/lib/callList";

export type CallQuestionType =
  | "yes_no"
  | "single"
  | "multi"
  | "dropdown"
  | "short_text"
  | "long_text"
  | "number"
  | "phone"
  | "date"
  | "email"
  | "rating";

export type CallQuestionOption = {
  value: string;
  label: string;
  /** Admin chooses whether selecting this option opens a details box. */
  allowText?: boolean;
  color?: string;
};

export type CallQuestion = {
  id: string;
  label: string;
  type: CallQuestionType;
  options: CallQuestionOption[];
  color?: string;
  showIf?: { questionId: string; equals: string } | null;
};

export const TEXT_QUESTION_TYPES = new Set<CallQuestionType>([
  "short_text",
  "long_text",
  "number",
  "phone",
  "date",
  "email",
  "rating",
]);

export type CallStatusOption = { value: string; label: string };

export type CallFormShape = {
  title: string;
  openingScript: string;
  closingScript: string;
  questions: CallQuestion[];
  statuses: CallStatusOption[];
};

export const CALL_FIELD_TOKENS = [
  "{{name}}",
  "{{phone}}",
  "{{halka}}",
  "{{village}}",
  "{{block}}",
  "{{position}}",
  "{{age}}",
  "{{gender}}",
  "{{father}}",
] as const;

export function defaultCallForm(): CallFormShape {
  return {
    title: "Booth Member Verification",
    openingScript:
      "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਜੀ!\n\nਮੈਂ ______, ਆਮ ਆਦਮੀ ਪਾਰਟੀ ਦੇ ਦਫ਼ਤਰ ਵੱਲੋਂ ਗੱਲ ਕਰ ਰਿਹਾ/ਰਹੀ ਹਾਂ।\n\nਜੇ ਤੁਹਾਡੇ ਕੋਲ 2 ਮਿੰਟ ਦਾ ਸਮਾਂ ਹੋਵੇ, ਤਾਂ ਕੀ ਮੈਂ ਤੁਹਾਡੇ ਨਾਲ ਇੱਕ ਛੋਟੀ ਜਿਹੀ ਗੱਲ ਕਰ ਸਕਦਾ/ਸਕਦੀ ਹਾਂ?",
    closingScript:
      "ਤੁਹਾਡੇ ਨਾਲ ਗੱਲ ਕਰਕੇ ਬਹੁਤ ਚੰਗਾ ਲੱਗਿਆ। ਤੁਸੀਂ ਆਪਣਾ ਕੀਮਤੀ ਸਮਾਂ ਦਿੱਤਾ, ਇਸ ਲਈ ਤੁਹਾਡਾ ਦਿਲੋਂ ਧੰਨਵਾਦ ਜੀ।\n\nਕਿਰਪਾ ਕਰਕੇ ਇਹ ਨੰਬਰ ਸੰਭਾਲ ਕੇ ਰੱਖੋ। ਇਹ ਤੁਹਾਡੇ ਹਲਕੇ ਲਈ ਪਾਰਟੀ ਦਾ ਨੰਬਰ ਹੈ, ਤਾਂ ਜੋ ਪਾਰਟੀ ਵੱਲੋਂ ਜਾਣਕਾਰੀ ਸਮੇਂ-ਸਮੇਂ ਤੇ ਮਿਲਦੀ ਰਹੇ।\n\nਤੁਹਾਡਾ ਦਿਨ ਸੁਖ ਤੇ ਸਫਲ ਰਹੇ।",
    questions: [
      {
        id: "q1",
        label: "ਕੀ ਮੇਰੀ ਗੱਲ ਸ੍ਰੀ/ਸ੍ਰੀਮਤੀ {{name}} ਜੀ ਨਾਲ ਹੋ ਰਹੀ ਹੈ?",
        type: "single",
        options: [
          { value: "yes", label: "Yes (ਹਾਂ)" },
          { value: "other", label: "Other (ਕੋਈ ਹੋਰ ਵਿਅਕਤੀ)", allowText: true },
        ],
      },
      {
        id: "q2",
        label: "ਕੀ ਤੁਸੀਂ ਆਮ ਆਦਮੀ ਪਾਰਟੀ ਵਿੱਚ ਬੂਥ ਕਮੇਟੀ ਮੈਂਬਰ ਦੇ ਰੂਪ ਵਿੱਚ ਕੰਮ ਕਰ ਰਹੇ ਹੋ?",
        type: "yes_no",
        options: [
          { value: "yes", label: "Yes (ਹਾਂ)" },
          { value: "no", label: "No (ਨਹੀਂ)" },
        ],
      },
      {
        id: "q2_1",
        label: "ਕੋਈ ਗੱਲ ਨਹੀਂ। ਕੀ ਤੁਸੀਂ ਆਮ ਆਦਮੀ ਪਾਰਟੀ ਨਾਲ ਜੁੜੇ ਹੋਏ ਹੋ?",
        type: "yes_no",
        options: [
          { value: "yes", label: "Yes (ਹਾਂ)" },
          { value: "no", label: "No (ਨਹੀਂ)" },
        ],
        showIf: { questionId: "q2", equals: "no" },
      },
      {
        id: "q3",
        label: "ਤੁਹਾਡਾ ਬੂਥ ਨੰਬਰ ਕੀ ਹੈ?",
        type: "short_text",
        options: [],
        showIf: { questionId: "q2", equals: "yes" },
      },
      {
        id: "q4",
        label: "ਕੀ ਤੁਸੀਂ ਆਪਣੇ ਬੂਥ ਇੰਚਾਰਜ ਨੂੰ ਜਾਣਦੇ ਹੋ?",
        type: "yes_no",
        options: [
          { value: "yes", label: "Yes (ਹਾਂ)" },
          { value: "no", label: "No (ਨਹੀਂ)" },
        ],
        showIf: { questionId: "q2", equals: "yes" },
      },
      {
        id: "q4_1",
        label: "ਜੇ ਹਾਂ, ਤਾਂ ਉਹਨਾਂ ਦਾ ਨਾਮ ਕੀ ਹੈ?",
        type: "short_text",
        options: [],
        showIf: { questionId: "q4", equals: "yes" },
      },
      {
        id: "q5",
        label: "ਕੀ ਪਾਰਟੀ ਵੱਲੋਂ ਨਿਯੁਕਤ ਇੰਚਾਰਜ ਨਾਲ ਤੁਹਾਡੀ ਮੁਲਾਕਾਤ ਜਾਂ ਗੱਲਬਾਤ ਹੋਈ ਹੈ?",
        type: "yes_no",
        options: [
          { value: "yes", label: "Yes (ਹਾਂ)" },
          { value: "no", label: "No (ਨਹੀਂ)" },
        ],
      },
      {
        id: "q6",
        label: "ਤੁਸੀਂ ਹਾਲ ਹੀ ਵਿੱਚ ਪਾਰਟੀ ਦੀ ਕਿਸ ਗਤੀਵਿਧੀ ਵਿੱਚ ਹਿੱਸਾ ਲਿਆ ਸੀ?",
        type: "single",
        options: [
          { value: "rahnan", label: "ਰਹਿਣਾਨ ਚਾਲੀਸਾ ਕੈਂਪੇਨ" },
          { value: "lok", label: "ਲੋਕ ਮਿਲਣੀ ਕੈਂਪੇਨ" },
          { value: "sir", label: "SIR ਕੈਂਪੇਨ" },
          { value: "school", label: "ਸਕੂਲ ਵੀਡੀਓ ਕੈਂਪੇਨ" },
          { value: "other", label: "ਹੋਰ", allowText: true },
          { value: "none", label: "ਕਿਸੇ ਗਤੀਵਿਧੀ ਵਿੱਚ ਹਿੱਸਾ ਨਹੀਂ ਲਿਆ" },
          { value: "unknown", label: "ਜਾਣਕਾਰੀ ਨਹੀਂ ਹੈ" },
        ],
      },
    ],
    statuses: CALL_OUTCOMES.map((s) => ({ value: s.value, label: s.label })),
  };
}

export function fillCallTokens(
  text: string,
  row: {
    name?: string;
    phone?: string;
    halka?: string;
    villageWard?: string;
    block?: string;
    position?: string;
    age?: string;
    gender?: string;
    fatherName?: string;
  }
) {
  const name = row.name || "";
  let out = text
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\s*name\s*\}/gi, name)
    .replace(/\{\{\s*phone\s*\}\}/gi, row.phone || "")
    .replace(/\{\{\s*halka\s*\}\}/gi, row.halka || "")
    .replace(/\{\{\s*village\s*\}\}/gi, row.villageWard || "")
    .replace(/\{\{\s*block\s*\}\}/gi, row.block || "")
    .replace(/\{\{\s*position\s*\}\}/gi, row.position || "")
    .replace(/\{\{\s*age\s*\}\}/gi, row.age || "")
    .replace(/\{\{\s*gender\s*\}\}/gi, row.gender || "")
    .replace(/\{\{\s*father\s*\}\}/gi, row.fatherName || "");
  if (name) out = out.replace(/_{3,}/g, name);
  return out;
}

export function questionVisible(q: CallQuestion, answers: Record<string, string>, all?: CallQuestion[]) {
  if (!q.showIf?.questionId) return true;
  if (answers[q.showIf.questionId] !== q.showIf.equals) return false;
  if (!all) return true;
  const parent = all.find((item) => item.id === q.showIf?.questionId);
  if (!parent) return false;
  return questionVisible(parent, answers, all);
}

export function slugStatus(label: string) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return slug || "status";
}

export function parseCallForm(raw: unknown): CallFormShape | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (!Array.isArray(row.questions) || !Array.isArray(row.statuses)) return null;
  return {
    title: String(row.title || "Booth Member Verification").slice(0, 120),
    openingScript: String(row.openingScript || "").slice(0, 4000),
    closingScript: String(row.closingScript || "").slice(0, 4000),
    questions: row.questions as CallQuestion[],
    statuses: row.statuses as CallStatusOption[],
  };
}
