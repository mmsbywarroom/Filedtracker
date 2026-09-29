import { NextResponse } from "next/server";
import { getCallAdminSession } from "@/lib/auth";
import { loadCallForm, saveCallForm } from "@/lib/callFormStore";
import { slugStatus, TEXT_QUESTION_TYPES, type CallFormShape, type CallQuestion, type CallQuestionType } from "@/lib/callForm";

const TYPES = new Set<CallQuestionType>([
  "yes_no",
  "single",
  "multi",
  "dropdown",
  "short_text",
  "long_text",
  "number",
  "phone",
  "date",
  "email",
  "rating",
]);

function hexColor(value: unknown) {
  const s = String(value || "");
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : undefined;
}

function cleanForm(body: unknown): CallFormShape | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as CallFormShape;
  const questions: CallQuestion[] = [];
  for (const q of raw.questions || []) {
    if (!q || typeof q.label !== "string" || !TYPES.has(q.type)) continue;
    const id = String(q.id || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40);
    if (!id) continue;
    const options = (q.options || [])
      .filter((o) => o && o.label)
      .slice(0, 30)
      .map((o, i) => ({
        value: String(o.value || `opt_${i}`).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40) || `opt_${i}`,
        label: String(o.label).slice(0, 200),
        allowText: Boolean(o.allowText),
        ...(hexColor(o.color) ? { color: hexColor(o.color) } : {}),
        ...((o.showQuestionIds || []).length
          ? {
              showQuestionIds: (o.showQuestionIds || [])
                .map((id) => String(id || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 40))
                .filter(Boolean)
                .slice(0, 40),
            }
          : {}),
      }));
    questions.push({
      id,
      label: q.label.slice(0, 500),
      type: q.type,
      options: TEXT_QUESTION_TYPES.has(q.type) ? [] : options,
      ...(hexColor(q.color) ? { color: hexColor(q.color) } : {}),
      showIf:
        q.showIf?.questionId && q.showIf.equals
          ? { questionId: String(q.showIf.questionId).slice(0, 40), equals: String(q.showIf.equals).slice(0, 40) }
          : null,
    });
  }
  const statuses = (raw.statuses || [])
    .filter((s) => s && s.label)
    .slice(0, 20)
    .map((s) => ({
      value: String(s.value || slugStatus(s.label)).slice(0, 40),
      label: String(s.label).slice(0, 80),
    }));
  if (!questions.length || !statuses.length) return null;
  return {
    title: String(raw.title || "Booth Member Verification").slice(0, 120),
    openingScript: String(raw.openingScript || "").slice(0, 4000),
    closingScript: String(raw.closingScript || "").slice(0, 4000),
    questions,
    statuses,
  };
}

export async function GET() {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await loadCallForm());
}

export async function PUT(req: Request) {
  const s = await getCallAdminSession();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = cleanForm(await req.json().catch(() => null));
  if (!form) return NextResponse.json({ error: "Add at least one question and one call status." }, { status: 400 });
  await saveCallForm(form);
  return NextResponse.json({ ok: true });
}
