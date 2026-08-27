"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { downloadCsv, downloadPdf } from "@/lib/reportExport";

type Log = {
  id: string;
  when: string;
  userId: string;
  userName: string;
  userPhone: string;
  userDesignation: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  adminAccessLevel: string;
  reason: string;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function whenIst(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
}

export default function FaceResetLogsPage() {
  const [date, setDate] = useState(todayIst);
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState<Log[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/face-reset-logs?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    if (res.status === 403) {
      setErr("Only Super admin can view face reset logs.");
      setLogs([]);
      return;
    }
    const data = await res.json();
    setLogs(data.logs || []);
    setPage(1);
  }

  useEffect(() => {
    load();
  }, []);

  const pageRows = useMemo(() => logs.slice((page - 1) * pageSize, page * pageSize), [logs, page, pageSize]);

  const exportHeaders = ["When", "User", "Phone", "Designation", "Reset by", "Admin level", "Reason"];
  const exportRows = logs.map((r) => [
    whenIst(r.when),
    r.userName,
    r.userPhone,
    r.userDesignation,
    `${r.adminName} (${r.adminEmail})`,
    r.adminAccessLevel,
    r.reason,
  ]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Audit</p>
      <h1 className="text-2xl font-semibold">Face reset logs</h1>
      <p className="mt-1 text-sm text-navy/55">
        Super admin only — every face reset with who did it, when, whose face, and why.
      </p>

      <div className="mt-4 mb-4 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-card">
        <label className="text-xs font-medium text-navy/55">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 px-3 py-2 text-sm"
          />
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search user, admin, reason"
          className="h-11 min-w-[200px] flex-1 rounded-xl border border-navy/10 px-3 text-sm"
        />
        <button type="button" onClick={load} className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          Apply
        </button>
        <button
          type="button"
          onClick={() => downloadCsv(`face-reset-logs-${date || "all"}`, exportHeaders, exportRows)}
          disabled={!logs.length}
          className="h-11 rounded-xl border border-navy/15 px-4 text-sm font-semibold text-navy/70 disabled:opacity-40"
        >
          CSV
        </button>
        <button
          type="button"
          onClick={() => downloadPdf(`Face reset logs · ${date || "all"}`, exportHeaders, exportRows)}
          disabled={!logs.length}
          className="h-11 rounded-xl border border-navy/15 px-4 text-sm font-semibold text-navy/70 disabled:opacity-40"
        >
          PDF
        </button>
      </div>

      {err && <p className="mb-4 text-sm text-red-600">{err}</p>}

      <section className="overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Reset by</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{whenIst(r.when)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.userName}</p>
                    <p className="text-xs text-navy/50">{r.userPhone}</p>
                    <p className="text-xs text-navy/45">{r.userDesignation}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.adminName}</p>
                    <p className="text-xs text-navy/50">{r.adminEmail}</p>
                    <p className="text-xs text-navy/45">{r.adminAccessLevel}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[280px] text-xs text-navy/70">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.length && !err && <p className="p-8 text-center text-sm text-navy/50">No face reset logs for this filter.</p>}
        </div>
        {!!logs.length && (
          <PaginationBar page={page} pageSize={pageSize} total={logs.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
