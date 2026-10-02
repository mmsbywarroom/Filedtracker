"use client";

import { useEffect, useState } from "react";
import { TEXT_QUESTION_TYPES, type CallQuestionType } from "@/lib/callForm";
import { HALKA_METRIC_LABEL, isHalkaMetric } from "@/lib/halkaReportMatch";

type Option = { value: string; label: string };
type Column = { id: string; label: string; type: CallQuestionType; options: Option[] };
type Status = { value: string; label: string };
type Row = {
  id: string;
  createdAt: string | null;
  callerPhone: string;
  status: string;
  statusLabel: string;
  remarks: string;
  halka: string;
  villageWard: string;
  name: string;
  phone: string;
  age: string;
  gender: string;
  position: string;
  rawAnswers: Record<string, string>;
  answers: Record<string, string>;
};

const FIXED: { key: string; label: string }[] = [
  { key: "when", label: "When" },
  { key: "caller", label: "Caller" },
  { key: "halka", label: "Halka" },
  { key: "villageWard", label: "Village/Ward" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "age", label: "Age" },
  { key: "gender", label: "Gender" },
  { key: "position", label: "Position" },
];

export default function CallSubmissionsPage() {
  const [questions, setQuestions] = useState<Column[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [lists, setLists] = useState<Record<string, Option[]>>({});
  const [openKey, setOpenKey] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [msg, setMsg] = useState("");
  const [drill, setDrill] = useState<{ metric: string; halka: string; zone: string; raw: string } | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const metric = params.get("metric") || "";
    if (isHalkaMetric(metric)) {
      setDrill({
        metric,
        halka: params.get("halka") || "",
        zone: params.get("zone") || "",
        raw: params.get("raw") || "",
      });
    }
    setReady(true);
  }, []);

  useEffect(() => {
    fetch("/api/call/admin/submissions?lists=1").then(async (res) => {
      if (res.status === 401) return;
      const data = await res.json();
      setLists(data.options || {});
    });
  }, []);

  useEffect(() => {
    if (!openKey) return;
    function close(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-filter-menu]")) setOpenKey("");
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [openKey]);

  function toggleFilter(key: string, value: string) {
    setPage(1);
    setFilters((prev) => {
      const current = prev[key] || [];
      const nextValues = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      const next = { ...prev };
      if (nextValues.length) next[key] = nextValues;
      else delete next[key];
      return next;
    });
  }

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams({ page: String(page) });
    if (drill) {
      params.set("metric", drill.metric);
      if (drill.halka) params.set("halka", drill.halka);
      if (drill.zone) params.set("zone", drill.zone);
      if (drill.raw) params.set("raw", drill.raw);
    }
    for (const [key, values] of Object.entries(filters)) {
      for (const value of values) params.append(key, value);
    }
    fetch(`/api/call/admin/submissions?${params}`).then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setStatuses(data.statuses || []);
      setRows(data.rows || []);
      setTotal(Number(data.total || 0));
      setPageSize(Number(data.pageSize || 50));
    });
  }, [page, filters, drill, ready]);

  async function remove(row: Row) {
    if (!window.confirm(`Delete ${row.name}'s submission? This member returns to the caller as a fresh call.`)) return;
    setMsg("");
    const res = await fetch(`/api/call/admin/submissions?contactId=${encodeURIComponent(row.id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Could not delete this submission.");
      return;
    }
    setMsg(`${row.name} is a fresh call again.`);
    setFilters((prev) => ({ ...prev }));
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const tail = [
    { key: "status", label: "Call status" },
    { key: "remarks", label: "Remarks" },
  ];

  function optionsFor(key: string) {
    const stored = lists[key]?.length
      ? lists[key]
      : key === "status"
        ? statuses
        : (() => {
            const question = questions.find((item) => item.id === key);
            if (question && question.options.length && !TEXT_QUESTION_TYPES.has(question.type)) return question.options;
            return [];
          })();
    return [{ value: "__blank__", label: "Blank" }, ...stored.filter((option) => option.value !== "__blank__")];
  }

  function filterCell(key: string, wide = false) {
    const selected = filters[key] || [];
    const summary = !selected.length ? "All" : selected.length === 1 ? optionsFor(key).find((option) => option.value === selected[0])?.label || "1 selected" : `${selected.length} selected`;
    return (
      <div className="relative mt-1" data-filter-menu>
        <button
          type="button"
          onClick={() => setOpenKey((current) => (current === key ? "" : key))}
          className={`h-7 truncate rounded border border-slate-200 bg-white px-1 text-left font-normal ${wide ? "w-full min-w-[140px]" : "w-full min-w-[110px]"}`}
        >
          {summary}
        </button>
        {openKey === key ? (
          <div className="absolute left-0 z-30 mt-1 max-h-56 w-56 overflow-auto rounded-lg border border-slate-200 bg-white p-2 text-left shadow-lg">
            {optionsFor(key).map((option) => (
              <label key={option.value} className="flex items-start gap-2 py-1 text-[11px] font-normal">
                <input type="checkbox" className="mt-0.5" checked={selected.includes(option.value)} onChange={() => toggleFilter(key, option.value)} />
                <span className="whitespace-normal">{option.label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <main className="px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Call submissions</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            One row per member. Each column can filter Blank and more than one value. Deleting a submission sends that member back to the caller as a fresh call.
          </p>
        </div>
        <a href="/api/call/admin/reports?kind=submissions" className="rounded-xl bg-[#0A1628] px-3 py-2 text-sm font-semibold text-white">
          Download report
        </a>
      </div>
      {drill ? (
        <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
          {HALKA_METRIC_LABEL[drill.metric as keyof typeof HALKA_METRIC_LABEL]}
          {drill.halka ? ` · ${drill.halka}` : " · every halka"}
          {" · "}
          <a href="/call/admin/reports/halka" className="font-semibold text-blue-800 underline">Back to halka report</a>
        </p>
      ) : null}
      {msg ? <p className="mt-3 text-sm">{msg}</p> : null}
      <div className="mt-4 overflow-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-max text-left text-xs">
          <thead>
            <tr>
              {FIXED.map((col) => (
                <th key={col.key} className="sticky top-0 bg-slate-50 px-3 py-2 align-top">
                  <span className="whitespace-nowrap">{col.label}</span>
                  {filterCell(col.key)}
                </th>
              ))}
              {questions.map((q) => (
                <th key={q.id} className="sticky top-0 min-w-[180px] max-w-[260px] bg-slate-50 px-3 py-2 align-top" style={{ fontFamily: "var(--font-pa), sans-serif" }}>
                  <span className="block whitespace-normal leading-snug">{q.label}</span>
                  {filterCell(q.id, true)}
                </th>
              ))}
              {tail.map((col) => (
                <th key={col.key} className="sticky top-0 bg-slate-50 px-3 py-2 align-top">
                  <span className="whitespace-nowrap">{col.label}</span>
                  {filterCell(col.key, col.key === "remarks")}
                </th>
              ))}
              <th className="sticky top-0 bg-slate-50 px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2">{r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.callerPhone}</td>
                <td className="px-3 py-2">{r.halka}</td>
                <td className="px-3 py-2">{r.villageWard}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.phone}</td>
                <td className="px-3 py-2">{r.age}</td>
                <td className="px-3 py-2">{r.gender}</td>
                <td className="px-3 py-2">{r.position}</td>
                {questions.map((q) => (
                  <td key={q.id} className="min-w-[180px] max-w-[260px] whitespace-normal px-3 py-2" style={{ fontFamily: "var(--font-pa), sans-serif" }}>
                    {r.answers[q.id] || "—"}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2">{r.statusLabel}</td>
                <td className="min-w-[160px] max-w-[240px] whitespace-normal px-3 py-2">{r.remarks || "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <button type="button" onClick={() => setEditing(r)} className="mr-2 font-semibold text-[#0b6fbf]">Edit</button>
                  <button type="button" onClick={() => void remove(r)} className="font-semibold text-red-700">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-sm text-slate-500">No calling forms match these filters.</p> : null}
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm text-slate-600">
        <button type="button" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))} className="rounded-lg bg-white px-3 py-1.5 font-semibold shadow-sm disabled:opacity-40">
          Previous
        </button>
        <span>
          Page {page} of {pages} · {total.toLocaleString("en-IN")} members
        </span>
        <button type="button" disabled={page >= pages} onClick={() => setPage((n) => n + 1)} className="rounded-lg bg-white px-3 py-1.5 font-semibold shadow-sm disabled:opacity-40">
          Next
        </button>
      </div>
      {editing ? (
        <EditSubmission
          row={editing}
          questions={questions}
          statuses={statuses}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMsg("Submission updated.");
            setFilters((prev) => ({ ...prev }));
          }}
        />
      ) : null}
    </main>
  );
}

function EditSubmission({
  row,
  questions,
  statuses,
  onClose,
  onSaved,
}: {
  row: Row;
  questions: Column[];
  statuses: Status[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState(row.status);
  const [remarks, setRemarks] = useState(row.remarks);
  const [answers, setAnswers] = useState<Record<string, string>>({ ...row.rawAnswers });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/call/admin/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: row.id, status, remarks, answers }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not save this submission.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Edit submission: {row.name}</h2>
          <button type="button" onClick={onClose} className="text-lg leading-none">×</button>
        </div>
        <div className="space-y-3 overflow-y-auto px-4 py-3">
          {questions.map((q, i) => (
            <label key={q.id} className="block text-sm font-semibold" style={{ fontFamily: "var(--font-pa), sans-serif" }}>
              Q{i + 1}. {q.label}
              {q.type === "multi" ? (
                <div className="mt-1 space-y-1 font-normal">
                  {q.options.map((o) => {
                    const picked = (answers[q.id] || "").split("|").filter(Boolean);
                    const on = picked.includes(o.value);
                    return (
                      <label key={o.value} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setAnswer(q.id, (on ? picked.filter((value) => value !== o.value) : [...picked, o.value]).join("|"))}
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              ) : q.options.length && !TEXT_QUESTION_TYPES.has(q.type) ? (
                <select value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal">
                  <option value="">Blank</option>
                  {q.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input value={answers[q.id] || ""} onChange={(e) => setAnswer(q.id, e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal" />
              )}
            </label>
          ))}
          <label className="block text-sm font-semibold">
            Call status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 h-10 w-full rounded-xl border px-3 font-normal">
              <option value="">Choose a call status</option>
              {statuses.map((st) => (
                <option key={st.value} value={st.value}>{st.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Remarks
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 min-h-20 w-full rounded-xl border px-3 py-2 font-normal" />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-xl bg-[#0b6fbf] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
