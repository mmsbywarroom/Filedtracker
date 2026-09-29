"use client";

import { useEffect, useState } from "react";
import { CALL_FIELD_TOKENS, slugStatus, type CallFormShape, type CallQuestion, type CallQuestionType } from "@/lib/callForm";

const TYPES: { value: CallQuestionType; label: string }[] = [
  { value: "yes_no", label: "Yes / No" },
  { value: "single", label: "Single choice" },
  { value: "dropdown", label: "Dropdown" },
  { value: "short_text", label: "Short text" },
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
    <div className="min-h-screen bg-[#f4f7fb]">
      <header className="flex items-center justify-between bg-[#0A1628] px-4 py-3 text-white">
        <p className="font-semibold">Calling portal admin</p>
        <nav className="flex gap-3 text-sm">
          <a href="/call/admin">Contacts</a>
          <a href="/call/admin/form" className="underline">Form designer</a>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-semibold">Calling form</h1>
        <p className="text-sm text-slate-600">
          Build the script and questions the way you would a form. Use {CALL_FIELD_TOKENS.join(" ")} inside text to insert the contact&apos;s details.
        </p>
        <label className="block text-sm font-medium">
          Form title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl border px-3" />
        </label>
        <label className="block text-sm font-medium">
          Opening script
          <textarea value={form.openingScript} onChange={(e) => setForm({ ...form, openingScript: e.target.value })} className="mt-1 min-h-32 w-full rounded-xl border px-3 py-2" style={{ fontFamily: "var(--font-pa), sans-serif" }} />
        </label>

        {form.questions.map((q, i) => (
          <section key={q.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Question {i + 1}</p>
              <button
                type="button"
                className="text-xs font-semibold text-red-700"
                onClick={() => setForm({ ...form, questions: form.questions.filter((item) => item.id !== q.id) })}
              >
                Remove
              </button>
            </div>
            <label className="mt-2 block text-xs font-medium">
              Question text
              <textarea value={q.label} onChange={(e) => patchQuestion(q.id, { label: e.target.value })} className="mt-1 min-h-16 w-full rounded-xl border px-3 py-2 text-sm" style={{ fontFamily: "var(--font-pa), sans-serif" }} />
            </label>
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
                        : q.options,
                  });
                }}
                className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              >
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            {q.type !== "short_text" ? (
              <label className="mt-2 block text-xs font-medium">
                Options, one per line. End a line with * to show a text box.
                <textarea
                  value={q.options.map((o) => `${o.label}${o.allowText ? " *" : ""}`).join("\n")}
                  onChange={(e) => {
                    const options = e.target.value.split("\n").filter((line) => line.trim()).map((line, n) => {
                      const allowText = line.trim().endsWith("*");
                      const label = line.replace(/\s*\*$/, "").trim();
                      return { value: q.options[n]?.value || `opt_${n}`, label, allowText };
                    });
                    patchQuestion(q.id, { options });
                  }}
                  className="mt-1 min-h-24 w-full rounded-xl border px-3 py-2 text-sm"
                  style={{ fontFamily: "var(--font-pa), sans-serif" }}
                />
              </label>
            ) : null}
            <label className="mt-2 block text-xs font-medium">
              Show only when
              <select
                value={q.showIf ? `${q.showIf.questionId}=${q.showIf.equals}` : ""}
                onChange={(e) => {
                  if (!e.target.value) {
                    patchQuestion(q.id, { showIf: null });
                    return;
                  }
                  const [questionId, equals] = e.target.value.split("=");
                  patchQuestion(q.id, { showIf: { questionId, equals } });
                }}
                className="mt-1 h-10 w-full rounded-xl border px-3 text-sm"
              >
                <option value="">Always</option>
                {form.questions.filter((other) => other.id !== q.id).flatMap((other) =>
                  other.options.map((o) => (
                    <option key={`${other.id}-${o.value}`} value={`${other.id}=${o.value}`}>
                      Q {other.label.slice(0, 40)} = {o.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </section>
        ))}

        <button type="button" onClick={() => setForm({ ...form, questions: [...form.questions, blankQuestion()] })} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">
          Add question
        </button>

        <label className="block text-sm font-medium">
          Closing script
          <textarea value={form.closingScript} onChange={(e) => setForm({ ...form, closingScript: e.target.value })} className="mt-1 min-h-32 w-full rounded-xl border px-3 py-2" style={{ fontFamily: "var(--font-pa), sans-serif" }} />
        </label>
        <label className="block text-sm font-medium">
          Call statuses, one per line
          <textarea
            value={form.statuses.map((s) => s.label).join("\n")}
            onChange={(e) => {
              const statuses = e.target.value.split("\n").filter((line) => line.trim()).map((label) => {
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
    </div>
  );
}
