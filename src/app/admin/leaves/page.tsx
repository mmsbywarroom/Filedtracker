"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";

type Leave = {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  adminNote: string | null;
  reviewedBy: string | null;
  createdAt: string;
  user: {
    name: string;
    phone: string;
    designation: string;
    assemblyName: string;
    sectorAllotted: string;
    zone: string;
    district: string;
  };
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminLeavesPage() {
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});

  async function load() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/leaves?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setLeaves(data.leaves || []);
    setPage(1);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    const res = await fetch(`/api/admin/leaves/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: decision, adminNote: note[id] || "" }),
    });
    setBusyId("");
    if (res.ok) load();
  }

  const pageRows = useMemo(() => leaves.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [leaves, page, pageSize]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Approvals</p>
      <h1 className="text-2xl font-semibold">Leave requests</h1>
      <p className="mt-1 text-sm text-navy/55">
        You only see leave from the level just below you: State→Zone Coordinator/ZLC→DLC→Cluster→ALC→Sector Incharge (within your zone/district/assembly).
      </p>

      <div className="admin-toolbar mt-4 mb-4 flex flex-wrap items-end gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-11 rounded-xl border border-navy/10 px-3 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, number, assembly"
          className="h-11 min-w-[220px] flex-1 rounded-xl border border-navy/10 px-3 text-sm"
        />
        <button type="button" onClick={load} className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white">
          Apply
        </button>
      </div>

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((l) => (
                <tr key={l.id} className="border-t border-navy/5 align-top hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{l.user.name}</p>
                    <p className="text-xs text-navy/50">{l.user.phone}</p>
                    <p className="text-xs text-navy/45">
                      {l.user.designation} · {l.user.assemblyName}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {fmt(l.fromDate)} → {fmt(l.toDate)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="max-w-[280px]">{l.reason}</p>
                    {l.adminNote && <p className="mt-1 text-xs text-navy/50">Note: {l.adminNote}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        l.status === "approved"
                          ? "bg-emerald-50 text-emerald-700"
                          : l.status === "rejected"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {l.status === "pending" ? (
                      <div className="flex flex-col items-end gap-2">
                        <input
                          value={note[l.id] || ""}
                          onChange={(e) => setNote((n) => ({ ...n, [l.id]: e.target.value }))}
                          placeholder="Note (optional)"
                          className="w-44 rounded-lg border border-navy/10 px-2 py-1 text-xs"
                        />
                        <div className="admin-actions">
                          <button
                            type="button"
                            disabled={busyId === l.id}
                            onClick={() => decide(l.id, "approved")}
                            className="admin-btn-sm border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === l.id}
                            onClick={() => decide(l.id, "rejected")}
                            className="admin-btn-danger admin-btn-sm"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-right text-xs text-navy/45">{l.reviewedBy || ""}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!leaves.length && <p className="p-8 text-center text-sm text-navy/50">No leave requests for this filter.</p>}
        </div>
        {!!leaves.length && (
          <PaginationBar page={page} pageSize={pageSize} total={leaves.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
