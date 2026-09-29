"use client";

import { useEffect, useMemo, useState } from "react";
import { CALL_OUTCOMES } from "@/lib/callList";
import { fillCallTokens, questionVisible, type CallFormShape, type CallQuestion } from "@/lib/callForm";

type Row = {
  id: string;
  halka: string;
  villageWard: string;
  name: string;
  phone: string;
  age: string;
  gender: string;
  position: string;
  status: string;
  remarks: string;
  answers: Record<string, string>;
};

type Stats = {
  total: number;
  dialed: number;
  fresh: number;
  redial: number;
  connected: number;
  complete: number;
  notConnected: number;
};

const CARDS: { key: keyof Stats; label: string; tone: string }[] = [
  { key: "total", label: "Total calls", tone: "border-slate-200" },
  { key: "dialed", label: "Total dialed", tone: "border-sky-300" },
  { key: "fresh", label: "Fresh (pending)", tone: "border-amber-300" },
  { key: "redial", label: "Re-dial queue", tone: "border-orange-400" },
  { key: "connected", label: "Connected calls", tone: "border-emerald-400" },
  { key: "complete", label: "Call complete", tone: "border-green-500" },
  { key: "notConnected", label: "Not connected", tone: "border-rose-300" },
];

export function CallDesk() {
  const [phone, setPhone] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState<CallFormShape | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [index, setIndex] = useState(0);
  const [jump, setJump] = useState("");
  const [opened, setOpened] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const [remarks, setRemarks] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(search = q) {
    const res = await fetch(`/api/call/queue?q=${encodeURIComponent(search)}`);
    if (res.status === 401) {
      window.location.href = "/call";
      return;
    }
    const data = await res.json();
    setPhone(data.phone || "");
    setStats(data.stats || null);
    setForm(data.form || null);
    setRows(data.contacts || []);
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    if (!filter) return rows;
    if (filter === "fresh") return rows.filter((r) => !r.status);
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const safeIndex = visible.length ? Math.min(index, visible.length - 1) : 0;
  const row = visible[safeIndex] || null;

  useEffect(() => {
    setIndex(0);
    setOpened(false);
    setFormOpen(false);
  }, [filter, q]);

  function show(i: number) {
    const next = Math.max(0, Math.min(visible.length - 1, i));
    setIndex(next);
    setOpened(false);
    setFormOpen(false);
    const current = visible[next];
    setAnswers(current?.answers || {});
    setStatus(current?.status || "");
    setRemarks(current?.remarks || "");
  }

  function openRecord() {
    if (!row) return;
    setOpened(true);
    setAnswers(row.answers || {});
    setStatus(row.status || "");
    setRemarks(row.remarks || "");
  }

  async function save(goNext: boolean) {
    if (!row || !status) {
      setMsg("Select a call status.");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/call/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: row.id, status, remarks, answers }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Could not save.");
      return;
    }
    setFormOpen(false);
    setOpened(false);
    await load(q);
    if (goNext) setIndex((i) => i + 1);
  }

  async function logout() {
    await fetch("/api/call/logout", { method: "POST" });
    window.location.href = "/call";
  }

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rows) map[r.status || "fresh"] = (map[r.status || "fresh"] || 0) + 1;
    return map;
  }, [rows]);

  return (
    <div className="min-h-screen bg-[#eef3f8] text-slate-900">
      <header className="flex items-center justify-between bg-[#0b6fbf] px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <img src="/aap-logo.png" alt="" className="h-8 w-auto rounded bg-white px-1" />
          <div>
            <p className="text-sm font-semibold">AAP Calling Dashboard</p>
            <p className="text-xs text-white/80">Booth member</p>
          </div>
        </div>
        <div className="text-right text-xs">
          <p>User: {phone || "—"}</p>
          <button type="button" onClick={logout} className="mt-1 rounded bg-white/15 px-2 py-1 font-semibold">
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4">
        {stats ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {CARDS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key === "fresh" ? "fresh" : c.key === "total" ? "" : "")}
                className={`rounded-xl border-t-4 bg-white px-3 py-3 text-left shadow-sm ${c.tone}`}
              >
                <p className="text-2xl font-semibold">{stats[c.key]}</p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">{c.label}</p>
              </button>
            ))}
          </div>
        ) : null}

        <section className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filter by status</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FilterChip active={filter === "fresh"} label={`Fresh: ${counts.fresh || 0}`} onClick={() => setFilter(filter === "fresh" ? "" : "fresh")} />
            {(form?.statuses || CALL_OUTCOMES).map((s) => (
              <FilterChip
                key={s.value}
                active={filter === s.value}
                label={`${s.label}: ${counts[s.value] || 0}`}
                onClick={() => setFilter(filter === s.value ? "" : s.value)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Search contact by mobile</h2>
          <div className="mt-2 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Enter 10 digit mobile number"
              className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <button type="button" onClick={() => load(q)} className="rounded-xl bg-[#0b6fbf] px-4 text-sm font-semibold text-white">
              Search
            </button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Assigned contact</h2>
            <div className="flex items-center gap-2 text-xs">
              <span>Go to</span>
              <input
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
                className="h-8 w-16 rounded border border-slate-200 px-2"
              />
              <button
                type="button"
                className="rounded bg-slate-100 px-2 py-1 font-semibold"
                onClick={() => {
                  const n = Number(jump);
                  if (n >= 1) show(n - 1);
                }}
              >
                Jump
              </button>
              <span>
                {visible.length ? safeIndex + 1 : 0} / {visible.length}
              </span>
            </div>
          </div>

          {opened && row ? (
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Field label="Halka" value={row.halka} />
              <Field label="Village/Ward" value={row.villageWard} />
              <Field label="Name" value={row.name} />
              <Field label="Phone" value={row.phone} />
              <Field label="Age" value={row.age} />
              <Field label="Gender" value={row.gender} />
              <Field label="Position" value={row.position} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">{row ? "Open this record to see the contact." : "No assigned contacts."}</p>
          )}

          <button
            type="button"
            disabled={!row}
            onClick={() => {
              if (!opened) openRecord();
              else setFormOpen(true);
            }}
            className="mt-4 h-14 w-full rounded-xl bg-[#16a34a] text-sm font-bold tracking-wide text-white disabled:opacity-40"
          >
            {opened ? "OPEN CALLING FORM" : "OPEN"}
          </button>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" disabled={safeIndex <= 0} onClick={() => show(safeIndex - 1)} className="h-11 rounded-xl bg-slate-100 text-sm font-semibold disabled:opacity-40">
              ← Previous
            </button>
            <button
              type="button"
              disabled={safeIndex >= visible.length - 1}
              onClick={() => show(safeIndex + 1)}
              className="h-11 rounded-xl bg-slate-100 text-sm font-semibold disabled:opacity-40"
            >
              Next →
            </button>
          </div>
          {row?.status ? <p className="mt-3 text-sm text-slate-600">Last status: {statusLabel(form, row.status)}</p> : null}
        </section>
      </main>

      {formOpen && row && form ? (
        <CallingForm
          row={row}
          form={form}
          answers={answers}
          setAnswers={setAnswers}
          status={status}
          setStatus={setStatus}
          remarks={remarks}
          setRemarks={setRemarks}
          busy={busy}
          msg={msg}
          onClose={() => setFormOpen(false)}
          onSave={() => save(true)}
        />
      ) : null}
    </div>
  );
}

function statusLabel(form: CallFormShape | null, value: string) {
  return form?.statuses.find((s) => s.value === value)?.label || value;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-semibold">{value || "—"}</p>
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-[#0b6fbf] text-white" : "bg-slate-100 text-slate-700"}`}
    >
      {label}
    </button>
  );
}

function CallingForm({
  row,
  form,
  answers,
  setAnswers,
  status,
  setStatus,
  remarks,
  setRemarks,
  busy,
  msg,
  onClose,
  onSave,
}: {
  row: Row;
  form: CallFormShape;
  answers: Record<string, string>;
  setAnswers: (v: Record<string, string>) => void;
  status: string;
  setStatus: (v: string) => void;
  remarks: string;
  setRemarks: (v: string) => void;
  busy: boolean;
  msg: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const script = { fontFamily: "var(--font-pa), sans-serif" };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">
            {form.title}: {row.name} ({row.phone})
          </h2>
          <button type="button" onClick={onClose} className="text-lg leading-none">
            ×
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-3">
          {form.openingScript ? (
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-950" style={script}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Opening script</p>
              <p className="whitespace-pre-wrap">{fillCallTokens(form.openingScript, row)}</p>
            </div>
          ) : null}
          {form.questions.filter((q) => questionVisible(q, answers, form.questions)).map((q, i) => (
            <QuestionBlock
              key={q.id}
              index={i + 1}
              question={q}
              row={row}
              answers={answers}
              onChange={(next) => setAnswers(next)}
            />
          ))}
          {form.closingScript ? (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-950" style={script}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Call closer script</p>
              <p className="whitespace-pre-wrap">{fillCallTokens(form.closingScript, row)}</p>
            </div>
          ) : null}
          <label className="block text-sm font-semibold">
            Call status *
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 font-normal">
              <option value="">Select call status</option>
              {form.statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Remarks (optional)
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 font-normal" placeholder="Add a note" />
          </label>
          {msg ? <p className="text-sm text-red-700">{msg}</p> : null}
        </div>
        <div className="flex gap-2 border-t px-4 py-3">
          <button type="button" onClick={() => setAnswers({})} className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white">
            Clear form
          </button>
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={onSave} className="ml-auto rounded-xl bg-[#0b6fbf] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            Save & next
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionBlock({
  index,
  question,
  row,
  answers,
  onChange,
}: {
  index: number;
  question: CallQuestion;
  row: Row;
  answers: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const label = fillCallTokens(question.label, row);
  const selected = answers[question.id] || "";
  const textKey = `${question.id}__text`;
  const option = question.options.find((o) => o.value === selected);
  const script = { fontFamily: "var(--font-pa), sans-serif" };

  function setValue(value: string) {
    onChange({ ...answers, [question.id]: value });
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3" style={script}>
      <p className="text-sm font-semibold">
        Q{index}. {label}
      </p>
      {question.type === "short_text" ? (
        <input
          value={selected}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
        />
      ) : question.type === "dropdown" ? (
        <select value={selected} onChange={(e) => setValue(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">
          <option value="">Select</option>
          {question.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-2 space-y-2">
          {question.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
              <input type="radio" name={question.id} checked={selected === o.value} onChange={() => setValue(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {option?.allowText ? (
        <input
          value={answers[textKey] || ""}
          onChange={(e) => onChange({ ...answers, [textKey]: e.target.value })}
          placeholder="Enter details"
          className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
        />
      ) : null}
    </div>
  );
}
