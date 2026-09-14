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

/** AttendanceChangeRequest.date is a calendar date — normalize to YYYY-MM-DD for filters. */
function requestDateYmd(d: string) {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function statusLabel(s: string) {
  if (s === "present") return "Present";
  if (s === "half_day") return "Half-day";
  if (s === "leave") return "Leave";
  if (s === "absent") return "Absent";
  if (s === "pending" || s === "in_progress") return "In progress";
  return s;
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

const selectClass = "h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm";

export default function AttendanceApprovalsPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [halka, setHalka] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [canDecide, setCanDecide] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function load() {
    setErr("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
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
    setPendingCount(typeof data.pendingCount === "number" ? data.pendingCount : 0);
    setCanDecide(Boolean(data.canDecide));
    setHint(data.reviewLevelHint || null);
    setPage(1);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    setPage(1);
  }, [q, dateFilter, zone, district, halka, pageSize]);

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

  const zones = useMemo(() => uniqueSorted(requests.map((r) => r.user.zone)), [requests]);
  const districts = useMemo(() => {
    const rows = zone ? requests.filter((r) => r.user.zone === zone) : requests;
    return uniqueSorted(rows.map((r) => r.user.district));
  }, [requests, zone]);
  const halkas = useMemo(() => {
    let rows = requests;
    if (zone) rows = rows.filter((r) => r.user.zone === zone);
    if (district) rows = rows.filter((r) => r.user.district === district);
    return uniqueSorted(rows.map((r) => r.user.assemblyName));
  }, [requests, zone, district]);

  const filtered = useMemo(() => {
    const textQ = q.trim().toLowerCase();
    return requests.filter((r) => {
      if (dateFilter && requestDateYmd(r.date) !== dateFilter) return false;
      if (zone && r.user.zone !== zone) return false;
      if (district && r.user.district !== district) return false;
      if (halka && r.user.assemblyName !== halka) return false;
      if (textQ) {
        const blob = [
          r.user.name,
          r.user.phone,
          r.user.assemblyName,
          r.user.zone,
          r.user.district,
          r.requestedByName,
          r.note,
          r.proposedStatus,
          r.previousStatus || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(textQ)) return false;
      }
      return true;
    });
  }, [requests, dateFilter, zone, district, halka, q]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [filtered, page, pageSize]
  );

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Approvals</p>
      <h1 className="text-2xl font-semibold">Attendance change approvals</h1>
      <p className="mt-1 text-sm text-navy/55">
        Cluster / ALC manual changes go to DLC. DLC manual changes go to ZLC. Status updates only after approval.
        Each request shows the requester&apos;s reason. Use Approve / Reject on pending rows.
        {hint === "DLC" ? " You are reviewing the DLC queue." : null}
        {hint === "ZLC" ? " You are reviewing the ZLC queue." : null}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl bg-amber-500 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/80">Pending for you</p>
          <p className="text-3xl font-semibold tabular-nums">{pendingCount}</p>
          <p className="text-xs text-white/75">Open Attendance approvals · Approve or Reject</p>
        </div>
      </div>

      <div className="admin-filters mt-4 mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <label className="text-xs font-medium text-navy/55">
          Request status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Date
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className={`${selectClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-navy/55">
          Zone
          <select
            value={zone}
            onChange={(e) => {
              setZone(e.target.value);
              setDistrict("");
              setHalka("");
            }}
            className={`${selectClass} mt-1`}
          >
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          District
          <select
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setHalka("");
            }}
            className={`${selectClass} mt-1`}
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Halka (assembly)
          <select value={halka} onChange={(e) => setHalka(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All halkas</option>
            {halkas.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55 md:col-span-2 xl:col-span-2">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, reason…"
            className={`${selectClass} mt-1`}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={load}
            className="h-11 w-full rounded-xl bg-teal px-4 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </div>
      </div>

      {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}
      <p className="mb-2 text-xs text-navy/45">
        Showing {filtered.length} of {requests.length} loaded requests
        {dateFilter || zone || district || halka || q.trim() ? " (filters applied)" : ""}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-navy/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-navy/5 text-xs uppercase tracking-wide text-navy/60">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Previous</th>
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
                  {r.previousStatus ? statusLabel(r.previousStatus) : "—"}
                </td>
                <td className="px-3 py-2 font-medium">{statusLabel(r.proposedStatus)}</td>
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
                <td colSpan={9} className="px-3 py-10 text-center text-navy/40">
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
        total={filtered.length}
        onPage={setPage}
        onPageSize={setPageSize}
      />
    </main>
  );
}
