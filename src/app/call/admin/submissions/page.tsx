"use client";

import { useEffect, useState } from "react";

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
  const [questions, setQuestions] = useState<{ id: string; label: string }[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetch("/api/call/admin/submissions").then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      const data = await res.json();
      setQuestions(data.questions || []);
      setRows(data.rows || []);
    });
  }, []);

  return (
    <main className="px-4 py-6">
      <h1 className="text-2xl font-semibold">Call submissions</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Each saved calling form. The member who was called is listed with their answers.
      </p>
      <div className="mt-4 overflow-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr>
              {["When", "Caller", "Halka", "Village/Ward", "Name", "Phone", "Age", "Gender", "Position"].map((h) => (
                <th key={h} className="sticky top-0 bg-slate-50 px-3 py-2">{h}</th>
              ))}
              {questions.map((q) => (
                <th key={q.id} className="sticky top-0 max-w-[220px] bg-slate-50 px-3 py-2 align-bottom" style={{ fontFamily: "var(--font-pa), sans-serif" }}>{q.label}</th>
              ))}
              {["Call status", "Remarks"].map((h) => (
                <th key={h} className="sticky top-0 bg-slate-50 px-3 py-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="whitespace-nowrap px-3 py-2">{new Date(r.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                <td className="px-3 py-2">{r.callerPhone}</td>
                <td className="px-3 py-2">{r.halka}</td>
                <td className="px-3 py-2">{r.villageWard}</td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2">{r.phone}</td>
                <td className="px-3 py-2">{r.age}</td>
                <td className="px-3 py-2">{r.gender}</td>
                <td className="px-3 py-2">{r.position}</td>
                {questions.map((q) => (
                  <td key={q.id} className="max-w-[220px] px-3 py-2" style={{ fontFamily: "var(--font-pa), sans-serif" }}>
                    {r.answers[q.id] || "—"}
                  </td>
                ))}
                <td className="px-3 py-2">{r.statusLabel}</td>
                <td className="max-w-[220px] px-3 py-2">{r.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="p-6 text-sm text-slate-500">No calling forms submitted yet.</p> : null}
      </div>
    </main>
  );
}
