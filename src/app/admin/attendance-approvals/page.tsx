"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";

type ChangeRequest = {
  id: string;
  date: string;
  proposedStatus: string;
  previousStatus: string | null;
  note: string;
  status: string;
  reviewLevel: string;
  requestedByName: string;
  requestedByLevel: string;
  requestedByEmail: string;
  adminNote: string | null;
  reviewedByEmail: string | null;
  createdAt: string;
  user: {
    name: string;
    phone: string;
    designation: string;
    assemblyName: string;
    sectorAllotted: string;
    zone: string;
    district: string;
    cluster: string;
  };
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(s: string) {
  if (s === "present") return "Present";
  if (s === "half_day") return "Half-day";
  if (s === "leave") return "Leave";
  if (s === "absent") return "Absent";
  return s;
}

export default function AttendanceApprovalsPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [canDecide, setCanDecide] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/attendance-change-requests?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Could not load requests.");
      return;
    }
    setRequests(data.requests || []);
    setCanDecide(Boolean(data.canDecide));
    setHint(data.reviewLevelHint || null);
    setPage(1);
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    setErr("");
    const res = await fetch(`/api/admin/attendance-change-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: decision, adminNote: note[id] || "" }),
    });
    setBusyId("");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Could not update request.");
      return;
    }
    load();
  }

  const pageRows = useMemo(
    () => requests.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [requests, page, pageSize]
  );

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Approvals</p>
      <h1 className="text-2xl font-semibold">Attendance change approvals</h1>
      <p className="mt-1 text-sm text-navy/55">
        Cluster / ALC manual changes go to DLC. DLC manual changes go to ZLC. Status updates only after approval.
        {hint === "DLC" ? " You are reviewing the DLC queue." : null}
        {hint === "ZLC" ? " You are reviewing the ZLC queue." : null}
      </p>

      <div className="admin-toolbar mt-4 mb-4 flex flex-wrap items-end gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl border border-navy/15 bg-white px-3 py-2 text-sm"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, reason…"
          className="min-w-[220px] rounded-xl border border-navy/15 bg-white px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={load}
          className="rounded-xl bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-navy/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-navy/5 text-xs uppercase tracking-wide text-navy/60">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Proposed</th>
              <th className="px-3 py-2">Requested by</th>
              <th className="px-3 py-2">Queue</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className="border-t border-navy/10 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.user.name}</div>
                  <div className="text-xs text-navy/50">
                    {r.user.phone} · {r.user.designation} · {r.user.assemblyName}
                  </div>
                  <div className="text-xs text-navy/40">
                    {r.user.zone} / {r.user.district}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div>{statusLabel(r.proposedStatus)}</div>
                  {r.previousStatus ? (
                    <div className="text-xs text-navy/45">Was: {statusLabel(r.previousStatus)}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <div>{r.requestedByName || r.requestedByEmail}</div>
                  <div className="text-xs text-navy/45">{r.requestedByLevel}</div>
                </td>
                <td className="px-3 py-2 font-medium">{r.reviewLevel}</td>
                <td className="px-3 py-2 max-w-[220px]">{r.note}</td>
                <td className="px-3 py-2 capitalize">{r.status}</td>
                <td className="px-3 py-2">
                  {r.status === "pending" && canDecide ? (
                    <div className="flex min-w-[180px] flex-col gap-2">
                      <input
                        value={note[r.id] || ""}
                        onChange={(e) => setNote((m) => ({ ...m, [r.id]: e.target.value }))}
                        placeholder="Optional note"
                        className="rounded-lg border border-navy/15 px-2 py-1 text-xs"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "approved")}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "rejected")}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ) : r.status !== "pending" ? (
                    <div className="text-xs text-navy/50">
                      {r.reviewedByEmail || "—"}
                      {r.adminNote ? <div>{r.adminNote}</div> : null}
                    </div>
                  ) : (
                    <span className="text-xs text-navy/45">Awaiting {r.reviewLevel}</span>
                  )}
                </td>
              </tr>
            ))}
            {!pageRows.length ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-navy/40">
                  No attendance change requests.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        total={requests.length}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
      />
    </main>
  );
}
