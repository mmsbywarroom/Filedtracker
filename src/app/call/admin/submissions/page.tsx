"use client";

import { useEffect, useState } from "react";

type Column = { id: string; label: string };
type Row = {
  id: string;
  createdAt: string;
  callerPhone: string;
  statusLabel: string;
  remarks: string;
  halka: string;
  villageWard: string;
  name: string;
  phone: string;
  age: string;
  gender: string;
  position: string;
  answers: Record<string, string>;
};

export default function CallSubmissionsPage() {
  const [questions, setQuestions] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    fetch(`/api/call/admin/submissions?page=${page}`).then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setRows(data.rows || []);
      setTotal(Number(data.total || 0));
      setPageSize(Number(data.pageSize || 50));
    });
  }, [page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="px-4 py-6">
      <h1 className="text-2xl font-semibold">Call submissions</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        One row per member. Saving again replaces that row. Only the answers from the latest save are shown.
      </p>
      <div className="mt-4 overflow-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-max text-left text-xs">
          <thead>
            <tr>
              {["When", "Caller", "Halka", "Village/Ward", "Name", "Phone", "Age", "Gender", "Position"].map((h) => (
                <th key={h} className="sticky top-0 whitespace-nowrap bg-slate-50 px-3 py-2">{h}</th>
              ))}
              {questions.map((q) => (
                <th
                  key={q.id}
                  className="sticky top-0 min-w-[180px] max-w-[260px] whitespace-normal bg-slate-50 px-3 py-2 align-bottom leading-snug"
                  style={{ fontFamily: "var(--font-pa), sans-serif" }}
                >
                  {q.label}
                </th>
              ))}
              {["Call status", "Remarks"].map((h) => (
                <th key={h} className="sticky top-0 whitespace-nowrap bg-slate-50 px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2">{new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
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
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-sm text-slate-500">No calling forms submitted yet.</p> : null}
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
    </main>
  );
}
