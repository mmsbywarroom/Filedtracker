"use client";

import { useEffect, useState } from "react";
import {
  CALL_FIELD_TOKENS,
  TEXT_QUESTION_TYPES,
  slugStatus,
  type CallFormShape,
  type CallQuestion,
  type CallQuestionOption,
  type CallQuestionType,
} from "@/lib/callForm";

const TYPES: { value: CallQuestionType; label: string }[] = [
  { value: "yes_no", label: "Yes / No" },
  { value: "single", label: "Single choice" },
  { value: "multi", label: "Multiple choice" },
  { value: "dropdown", label: "Dropdown" },
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "phone", label: "Phone" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "rating", label: "Rating 1–5" },
];

function blankQuestion(): CallQuestion {
  return {
    id: `q_${Date.now().toString(36)}`,
    label: "",
    type: "yes_no",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
    showIf: null,
  };
}

function slugOption(label: string, n: number) {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 24);
  return slug || `opt_${n}`;
}

export function CallFormDesigner() {
  const [form, setForm] = useState<CallFormShape | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/call/admin/form").then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      setForm(await res.json());
    });
  }, []);

  function patchQuestion(id: string, patch: Partial<CallQuestion>) {
    if (!form) return;
    setForm({
      ...form,
      questions: form.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  }

  function patchOption(questionId: string, index: number, patch: Partial<CallQuestionOption>) {
    if (!form) return;
    const q = form.questions.find((item) => item.id === questionId);
    if (!q) return;
    const options = q.options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    patchQuestion(questionId, { options });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/call/admin/form", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Form saved. Callers will see this on the next open." : data.error || "Could not save.");
  }

  if (!form) return <p className="p-6 text-sm">Loading form…</p>;

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Calling form</h1>
      <p className="text-sm text-slate-600">
        Choose the question type, the colour, and whether a details box opens after a choice. Insert a token to drop in the open contact&apos;s name.
      </p>
      <label className="block text-sm font-medium">
        Form title
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3" />
      </label>
      <ScriptBox
        label="Opening script"
        value={form.openingScript}
        onChange={(openingScript) => setForm({ ...form, openingScript })}
      />

      {form.questions.map((q, i) => (
        <section key={q.id} className="rounded-2xl bg-white p-4 shadow-sm" style={q.color ? { borderLeft: `6px solid ${q.color}` } : undefined}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Question {i + 1}</p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-500">
                Colour
                <input
                  type="color"
                  value={q.color || "#0b6fbf"}
                  onChange={(e) => patchQuestion(q.id, { color: e.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border"
                />
              </label>
              <button
                type="button"
                className="text-xs font-semibold text-red-700"
                onClick={() => setForm({ ...form, questions: form.questions.filter((item) => item.id !== q.id) })}
              >
                Remove
              </button>
            </div>
          </div>
          <label className="mt-2 block text-xs font-medium">
            Question text
            <textarea
              value={q.label}
              onChange={(e) => patchQuestion(q.id, { label: e.target.value })}
              className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 text-sm"
              style={{ fontFamily: "var(--font-pa), sans-serif" }}
            />
          </label>
          <TokenBar onInsert={(token) => patchQuestion(q.id, { label: `${q.label}${token}` })} />
          <label className="mt-2 block text-xs font-medium">
            Type
            <select
              value={q.type}
              onChange={(e) => {
                const type = e.target.value as CallQuestionType;
                patchQuestion(q.id, {
                  type,
                  options:
                    type === "yes_no"
                      ? [
                          { value: "yes", label: "Yes" },
                          { value: "no", label: "No" },
                        ]
                      : TEXT_QUESTION_TYPES.has(type)
                        ? []
                        : q.options,
                });
              }}
              className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          {!TEXT_QUESTION_TYPES.has(q.type) ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium">Choices — decide if a details box opens, and pick a colour</p>
              {q.options.map((o, n) => (
                <div key={`${q.id}-${n}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border border-slate-100 p-2">
                  <input
                    type="color"
                    value={o.color || "#64748b"}
                    onChange={(e) => patchOption(q.id, n, { color: e.target.value })}
                    className="h-8 w-9 cursor-pointer rounded border"
                    aria-label="Choice colour"
                  />
                  <input
                    value={o.label}
                    onChange={(e) => patchOption(q.id, n, { label: e.target.value, value: o.value || slugOption(e.target.value, n) })}
                    className="h-9 rounded-lg border px-2 text-sm"
                    style={{ fontFamily: "var(--font-pa), sans-serif" }}
                    placeholder="Choice label"
                  />
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-700"
                    onClick={() => patchQuestion(q.id, { options: q.options.filter((_, idx) => idx !== n) })}
                  >
                    Remove
                  </button>
                  <label className="col-span-3 flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={Boolean(o.allowText)}
                      onChange={(e) => patchOption(q.id, n, { allowText: e.target.checked })}
                    />
                    Show a details box when this choice is selected
                  </label>
                  <div className="col-span-3 rounded-lg bg-slate-50 px-2 py-2">
                    <p className="text-[11px] font-semibold text-slate-600">After this answer, show these questions</p>
                    <div className="mt-1 space-y-1">
                      {form.questions.filter((other) => other.id !== q.id).map((other) => {
                        const num = form.questions.findIndex((item) => item.id === other.id) + 1;
                        const checked = (o.showQuestionIds || []).includes(other.id);
                        return (
                          <label key={other.id} className="flex items-start gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const ids = new Set(o.showQuestionIds || []);
                                if (checked) ids.delete(other.id);
                                else ids.add(other.id);
                                patchOption(q.id, n, { showQuestionIds: Array.from(ids) });
                              }}
                            />
                            <span>
                              Q{num}. {other.label.slice(0, 80) || "Untitled"}
                            </span>
                          </label>
                        );
                      })}
                      {form.questions.length < 2 ? <p className="text-[11px] text-slate-400">Add another question first.</p> : null}
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="rounded-lg border px-2 py-1 text-xs font-semibold"
                onClick={() =>
                  patchQuestion(q.id, {
                    options: [...q.options, { value: `opt_${q.options.length}`, label: "", allowText: false }],
                  })
                }
              >
                Add choice
              </button>
            </div>
          ) : null}
          <p className="mt-3 text-[11px] text-slate-500">
            Leave every answer unchecked and this question always shows. Tick an answer above to open it only after that reply. One question can open from more than one answer, for example Yes on question 1 or Yes on question 2.
          </p>
        </section>
      ))}

      <button type="button" onClick={() => setForm({ ...form, questions: [...form.questions, blankQuestion()] })} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">
        Add question
      </button>

      <ScriptBox
        label="Call closer script — callers always see this"
        value={form.closingScript}
        onChange={(closingScript) => setForm({ ...form, closingScript })}
      />
      <label className="block text-sm font-medium">
        Call statuses, one per line
        <textarea
          value={form.statuses.map((s) => s.label).join("\n")}
          onChange={(e) => {
            const statuses = e.target.value
              .split("\n")
              .filter((line) => line.trim())
              .map((label) => {
                const text = label.trim();
                const existing = form.statuses.find((s) => s.label === text);
                return { value: existing?.value || slugStatus(text), label: text };
              });
            setForm({ ...form, statuses });
          }}
          className="mt-1 min-h-40 w-full rounded-xl border px-3 py-2 text-sm"
        />
      </label>
      {msg ? <p className="text-sm">{msg}</p> : null}
      <button type="button" disabled={busy} onClick={save} className="h-11 rounded-xl bg-[#0b6fbf] px-5 text-sm font-semibold text-white disabled:opacity-50">
        Save form
      </button>
    </main>
  );
}

function TokenBar({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {CALL_FIELD_TOKENS.map((token) => (
        <button key={token} type="button" onClick={() => onInsert(token)} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {token}
        </button>
      ))}
    </div>
  );
}

function ScriptBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-32 w-full rounded-xl border px-3 py-2"
        style={{ fontFamily: "var(--font-pa), sans-serif" }}
      />
      <TokenBar onInsert={(token) => onChange(`${value}${token}`)} />
    </label>
  );
}
