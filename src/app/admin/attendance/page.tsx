"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { SearchSelect } from "@/components/SearchSelect";
import AdminUsersMap, { type LiveMapUser } from "@/components/AdminUsersMapDynamic";
import { hierarchyDesignations } from "@/lib/hierarchy";
import { downloadAssemblyAttendancePdfZip } from "@/lib/assemblyAttendancePdf";
import { downloadCsv } from "@/lib/reportExport";
import { clientSourceLabel } from "@/lib/clientSource";
import { absentOrInProgressHint, absentOrInProgressLabel } from "@/lib/dailyAttendance";

type AttStatus = "present" | "half_day" | "absent" | "leave";
type RowStatus = AttStatus | "pending";

type Row = {
  userId: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  status: RowStatus;
  statusLabel: string;
  source: "auto" | "manual";
  reason: string;
  hoursWorked: number;
  punchInAt: string | null;
  punchOutAt: string | null;
  punchInClient?: string | null;
  punchInClients?: string[];
  sessionCount?: number;
  flagged?: boolean;
  flagReason?: string;
  flagSameCount?: number;
  hasSameInOutSession?: boolean;
};

type Summary = {
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  pending: number;
  flagged: number;
  total: number;
};

type SnapshotRow = {
  slot: number;
  slotLabel: string;
  scheduledAt?: string;
  lat: number;
  lng: number;
  recordedAt: string;
  sameGroup?: boolean;
  valid?: boolean;
};

type FlagDetail = {
  name: string;
  phone: string;
  sameCount: number;
  sameSnapshots: SnapshotRow[];
  sessions: {
    punchInAt: string;
    punchOutAt: string | null;
    snapshots: SnapshotRow[];
    sameSnapshots: SnapshotRow[];
    dominantCount: number;
  }[];
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
}

function statusClass(status: string) {
  if (status === "present") return "bg-emerald-50 text-emerald-700";
  if (status === "half_day") return "bg-amber-50 text-amber-800";
  if (status === "leave") return "bg-sky-50 text-sky-800";
  if (status === "pending") return "bg-orange-50 text-orange-800";
  return "bg-red-50 text-red-700";
}

function statusTitle(status: RowStatus) {
  if (status === "half_day") return "Half-day";
  if (status === "pending") return "Pending punch-in";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function unique(rows: Row[], key: keyof Row) {
  return Array.from(new Set(rows.map((r) => String(r[key] || "")).filter(Boolean))).sort();
}

const selectClass = "h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm";

export default function AttendanceModulePage() {
  const [date, setDate] = useState(todayIst);
  const [statusFilter, setStatusFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [sameCoordsFilter, setSameCoordsFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [assembly, setAssembly] = useState("");
  const [designation, setDesignation] = useState("");
  const [sector, setSector] = useState("");
  const [q, setQ] = useState("");
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [visibleDens, setVisibleDens] = useState<string[]>(() => hierarchyDesignations());
  const [pending, setPending] = useState<{
    userId: string;
    name: string;
    status: AttStatus;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [statusErr, setStatusErr] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [mapUsers, setMapUsers] = useState<LiveMapUser[]>([]);
  const [mapLiveOnly, setMapLiveOnly] = useState(false);
  const [mapSelectedUserId, setMapSelectedUserId] = useState<string | null>(null);
  const [flagDetail, setFlagDetail] = useState<FlagDetail | null>(null);
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  const [flagShowAll, setFlagShowAll] = useState(false);

  async function load() {
    const params = new URLSearchParams({ date });
    const res = await fetch(`/api/admin/daily-attendance?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setAllRows(data.rows || []);
    setPage(1);
  }

  useEffect(() => {
    load();
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.admin?.visibleDesignations) && d.admin.visibleDesignations.length) {
          setVisibleDens(d.admin.visibleDesignations);
        }
      })
      .catch(() => {});
  }, [date]);

  const loadMapUsers = useCallback(async () => {
    const params = new URLSearchParams({ date });
    if (mapLiveOnly) params.set("liveOnly", "1");
    const res = await fetch(`/api/admin/live-locations?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    setMapUsers(data.users || []);
  }, [date, mapLiveOnly]);

  useEffect(() => {
    void loadMapUsers();
    const id = window.setInterval(() => void loadMapUsers(), 60_000);
    return () => window.clearInterval(id);
  }, [loadMapUsers]);

  const rows = useMemo(() => {
    const sectorQ = sector.trim().toLowerCase();
    const textQ = q.trim().toLowerCase();
    return allRows.filter((r) => {
      if (zone && r.zone !== zone) return false;
      if (district && r.district !== district) return false;
      if (assembly && r.assemblyName !== assembly) return false;
      if (designation && r.designation !== designation) return false;
      if (sectorQ && !(r.sectorAllotted || "").toLowerCase().includes(sectorQ)) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (flagFilter === "flagged" && !r.flagged) return false;
      if (flagFilter === "not_flagged" && r.flagged) return false;
      if (sameCoordsFilter === "yes" && !r.hasSameInOutSession) return false;
      if (sameCoordsFilter === "no" && r.hasSameInOutSession) return false;
      if (clientFilter === "none" && r.punchInClient) return false;
      if (clientFilter && clientFilter !== "none") {
        const clients = r.punchInClients?.length ? r.punchInClients : r.punchInClient ? [r.punchInClient] : [];
        if (!clients.includes(clientFilter)) return false;
      }
      if (textQ) {
        const text = [r.name, r.phone, r.assemblyName, r.designation, r.zone, r.district, r.sectorAllotted]
          .join(" ")
          .toLowerCase();
        if (!text.includes(textQ)) return false;
      }
      return true;
    });
  }, [allRows, zone, district, assembly, designation, sector, statusFilter, flagFilter, sameCoordsFilter, clientFilter, q]);

  const summary = useMemo(() => {
    const s: Summary = { present: 0, halfDay: 0, absent: 0, leave: 0, pending: 0, flagged: 0, total: rows.length };
    for (const r of rows) {
      if (r.status === "present") s.present += 1;
      else if (r.status === "half_day") s.halfDay += 1;
      else if (r.status === "leave") s.leave += 1;
      else if (r.status === "pending") s.pending += 1;
      else s.absent += 1;
      if (r.flagged) s.flagged += 1;
    }
    return s;
  }, [rows]);

  useEffect(() => {
    setPage(1);
  }, [zone, district, assembly, designation, sector, statusFilter, flagFilter, sameCoordsFilter, clientFilter, q, pageSize]);

  async function applyStatus() {
    if (!pending) return;
    if (reason.trim().length < 3) {
      setStatusErr("Reason is required (at least 3 characters).");
      return;
    }
    setBusy(pending.userId);
    setStatusErr("");
    const res = await fetch("/api/admin/daily-attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: pending.userId, date, status: pending.status, note: reason.trim() }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatusErr(data.error || "Could not update status.");
      return;
    }
    setPending(null);
    setReason("");
    load();
  }

  function requestStatus(userId: string, name: string, status: AttStatus, current: string) {
    if (status === current) return;
    setPending({ userId, name, status });
    setReason("");
    setStatusErr("");
  }

  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [rows, page, pageSize]);

  const rowUserIds = useMemo(() => new Set(rows.map((r) => r.userId)), [rows]);
  const filteredMapUsers = useMemo(
    () => mapUsers.filter((u) => rowUserIds.has(u.userId)),
    [mapUsers, rowUserIds]
  );

  const exportHeaders = [
    "Date",
    "Name",
    "Phone",
    "Designation",
    "Assembly",
    "Sector",
    "Zone",
    "District",
    "Punch In",
    "Punch via",
    "Punch Out",
    "Hours",
    "Status",
    "Source",
    "Flagged",
    "Same Checks",
    "Flag Reason",
    "Why",
  ];

  const exportRows = useMemo(
    () =>
      rows.map((r) => [
        date,
        r.name,
        r.phone,
        r.designation,
        r.assemblyName,
        r.sectorAllotted,
        r.zone,
        r.district,
        fmtDateTime(r.punchInAt),
        r.punchInClient ? clientSourceLabel(r.punchInClient) : "",
        fmtDateTime(r.punchOutAt),
        r.hoursWorked > 0 ? r.hoursWorked : "",
        r.statusLabel,
        r.source,
        r.flagged ? "Yes" : "No",
        r.flagSameCount || "",
        r.flagReason || "",
        r.reason,
      ]),
    [rows, date]
  );

  async function downloadZip() {
    if (!rows.length) return;
    setZipBusy(true);
    try {
      await downloadAssemblyAttendancePdfZip(date, rows);
    } finally {
      setZipBusy(false);
    }
  }

  function downloadCsvExport() {
    if (!rows.length) return;
    downloadCsv(`attendance-${date}`, exportHeaders, exportRows);
  }

  async function openFlagDetail(userId: string, name: string) {
    setFlagBusy(userId);
    setFlagShowAll(false);
    try {
      const params = new URLSearchParams({ userId, date });
      const res = await fetch(`/api/admin/daily-attendance/interval-snapshots?${params}`);
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      if (!res.ok) return;
      setFlagDetail({
        name: data.user?.name || name,
        phone: data.user?.phone || "",
        sameCount: data.sameCount || 0,
        sameSnapshots: data.sameSnapshots || [],
        sessions: data.sessions || [],
      });
    } finally {
      setFlagBusy(null);
    }
  }

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
      <h1 className="text-2xl font-semibold">Date-wise attendance</h1>
      <p className="mt-1 text-sm text-navy/55">
        Auto: punch by 10:30 + 6–12h = Present · after 10:30 to 1:00 = Half-day · after 1:00 PM no punch = Absent ·
        until 1:00 PM, no punch stays Pending. Leave mark / approved leave / holiday (that designation) = Leave. Multiple punch-ins
        the same day (e.g. after GPS/phone off) are added together for hours. Manual change requires a reason. Flag (native punch-in
        only): 8+ thirty-minute
        location checks at the same lat/lng during a session (no block — admin review only).
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="rounded-2xl bg-emerald-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Present</p>
          <p className="text-2xl font-semibold">{summary.present}</p>
        </div>
        <div className="rounded-2xl bg-amber-500 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Half-day</p>
          <p className="text-2xl font-semibold">{summary.halfDay}</p>
        </div>
        <div className="rounded-2xl bg-orange-500 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Pending</p>
          <p className="text-2xl font-semibold">{summary.pending}</p>
        </div>
        <div className="rounded-2xl bg-red-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">{absentOrInProgressLabel(date)}</p>
          <p className="text-xs text-white/70">{absentOrInProgressHint(date)}</p>
          <p className="text-2xl font-semibold">{summary.absent}</p>
        </div>
        <div className="rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Leave</p>
          <p className="text-2xl font-semibold">{summary.leave}</p>
        </div>
        <div className="rounded-2xl bg-violet-600 px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Flagged</p>
          <p className="text-xs text-white/70">Same lat/lng ×8</p>
          <p className="text-2xl font-semibold">{summary.flagged}</p>
        </div>
        <div className="rounded-2xl bg-ink px-4 py-3 text-white shadow-card">
          <p className="text-xs uppercase tracking-wider text-white/75">Total</p>
          <p className="text-2xl font-semibold">{summary.total}</p>
        </div>
      </div>

      <div className="admin-filters mt-4 mb-4 grid gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        <label className="text-xs font-medium text-navy/55">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${selectClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-navy/55 md:col-span-2 xl:col-span-1">
          Search
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone, assembly"
            className={`${selectClass} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-navy/55">
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All statuses</option>
            <option value="present">Present</option>
            <option value="half_day">Half-day</option>
            <option value="pending">Pending punch-in</option>
            <option value="absent">Absent</option>
            <option value="leave">Leave</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Punch via
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All (web + native)</option>
            <option value="web">Web</option>
            <option value="native">Native app</option>
            <option value="capacitor">Old mobile app</option>
            <option value="none">No punch-in</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Flag
          <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All</option>
            <option value="flagged">Flagged only</option>
            <option value="not_flagged">Not flagged</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Same in/out lat-lng
          <select
            value={sameCoordsFilter}
            onChange={(e) => setSameCoordsFilter(e.target.value)}
            className={`${selectClass} mt-1`}
          >
            <option value="">All</option>
            <option value="yes">Same coordinates</option>
            <option value="no">Different coordinates</option>
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Designation
          <select value={designation} onChange={(e) => setDesignation(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All designations</option>
            {visibleDens.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Zone
          <select value={zone} onChange={(e) => setZone(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All zones</option>
            {unique(allRows, "zone").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          District
          <select value={district} onChange={(e) => setDistrict(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All districts</option>
            {unique(allRows, "district").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-navy/55">
          Assembly
          <select value={assembly} onChange={(e) => setAssembly(e.target.value)} className={`${selectClass} mt-1`}>
            <option value="">All assemblies</option>
            {unique(allRows, "assemblyName").map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="text-xs font-medium text-navy/55">
          Sector
          <div className="mt-1">
            <SearchSelect
              value={sector}
              onChange={setSector}
              options={unique(allRows, "sectorAllotted")}
              placeholder="Search sector allotted"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center md:col-span-3 lg:col-span-4 xl:col-span-8">
          <button
            type="button"
            onClick={downloadZip}
            disabled={zipBusy || !rows.length}
            className="h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            {zipBusy ? "Preparing PDF ZIP…" : `Download PDF ZIP (${rows.length} users · ${date})`}
          </button>
          <button
            type="button"
            onClick={downloadCsvExport}
            disabled={!rows.length}
            className="h-11 rounded-xl border border-navy/15 bg-white px-4 text-sm font-semibold text-navy disabled:opacity-40"
          >
            Download CSV ({rows.length} rows · filters applied)
          </button>
          <a
            href="/api/admin/stationary-sessions?days=7&exact=1&sessions=1"
            className="inline-flex h-11 items-center rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-900"
          >
            Same in/out lat-lng CSV (7 days)
          </a>
          <p className="text-xs text-navy/50">
            PDF ZIP = one file per Halka (filtered rows only). CSV = current filtered table. Violet = last 7 days where punch-in & punch-out
            lat/lng match (with coordinates).
          </p>
        </div>
      </div>

      <section className="admin-panel mb-4 p-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Live map — user locations</h2>
            <p className="text-xs text-navy/50">
              Green = punched in now · Grey = last known today · Map follows your table filters · refreshes every 60s
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-navy/60">
            <input
              type="checkbox"
              checked={mapLiveOnly}
              onChange={(e) => setMapLiveOnly(e.target.checked)}
              className="rounded border-navy/20"
            />
            Live users only
          </label>
        </div>
        <AdminUsersMap
          users={filteredMapUsers}
          selectedUserId={mapSelectedUserId}
          onSelectUser={setMapSelectedUserId}
          height={420}
        />
        {!!filteredMapUsers.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {filteredMapUsers.slice(0, 12).map((u) => (
              <button
                key={u.userId}
                type="button"
                onClick={() => setMapSelectedUserId(u.userId)}
                className={`rounded-lg px-2 py-1 text-xs font-medium ${
                  mapSelectedUserId === u.userId
                    ? "bg-emerald-600 text-white"
                    : u.isLive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-navy/5 text-navy/70"
                }`}
              >
                {u.name}
                {u.isLive ? " · live" : ""}
              </button>
            ))}
            {filteredMapUsers.length > 12 ? (
              <span className="self-center text-xs text-navy/45">+{filteredMapUsers.length - 12} more on map</span>
            ) : null}
          </div>
        )}
      </section>

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Assembly / Sector</th>
                <th className="px-4 py-3">Zone / District</th>
                <th className="px-4 py-3">Punch in</th>
                <th className="px-4 py-3">Punch via</th>
                <th className="px-4 py-3">Punch out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Flag</th>
                <th className="px-4 py-3">Why</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.userId} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-navy/50">{r.phone}</p>
                    <p className="text-xs text-navy/45">{r.designation}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.assemblyName}</p>
                    <p className="text-xs text-navy/50">{r.sectorAllotted}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{r.zone || "—"}</p>
                    <p className="text-xs text-navy/50">{r.district || "—"}</p>
                  </td>
                  <td className="px-4 py-3">{fmtTime(r.punchInAt)}</td>
                  <td className="px-4 py-3">
                    {r.punchInClient ? (
                      <span
                        className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${
                          r.punchInClient === "native"
                            ? "bg-teal/15 text-teal"
                            : r.punchInClient === "capacitor"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-navy/10 text-navy/70"
                        }`}
                      >
                        {clientSourceLabel(r.punchInClient)}
                      </span>
                    ) : (
                      <span className="text-xs text-navy/35">—</span>
                    )}
                    {(r.punchInClients || []).length > 1 ? (
                      <p className="mt-1 text-[10px] text-navy/45">{r.punchInClients!.map(clientSourceLabel).join(" + ")}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{fmtTime(r.punchOutAt)}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.hoursWorked > 0 ? `${r.hoursWorked}h` : "—"}
                    {(r.sessionCount || 0) > 1 ? (
                      <p className="text-[10px] font-normal text-navy/45">{r.sessionCount} sessions</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      disabled={busy === r.userId}
                      onChange={(e) => requestStatus(r.userId, r.name, e.target.value as AttStatus, r.status)}
                      className={`rounded-xl border border-navy/10 px-2 py-1.5 text-xs font-semibold ${statusClass(r.status)}`}
                    >
                      {r.status === "pending" ? <option value="pending">Pending punch-in</option> : null}
                      <option value="present">Present</option>
                      <option value="half_day">Half-day</option>
                      <option value="absent">Absent</option>
                      <option value="leave">Leave</option>
                    </select>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-navy/40">
                      {r.source === "manual" ? "Manual" : "Auto"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {r.flagged ? (
                      <span className="inline-flex rounded-lg bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-800">
                        Flagged
                      </span>
                    ) : (
                      <span className="text-xs text-navy/35">—</span>
                    )}
                    {r.flagged && r.flagSameCount ? (
                      <button
                        type="button"
                        disabled={flagBusy === r.userId}
                        onClick={() => void openFlagDetail(r.userId, r.name)}
                        className="mt-1 text-[10px] font-semibold text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900 disabled:opacity-50"
                      >
                        {flagBusy === r.userId ? "Loading…" : `${r.flagSameCount} same checks`}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 max-w-[240px] text-xs text-navy/55">
                    {r.flagged && r.flagReason ? (
                      <p className="mb-1 font-medium text-violet-800">{r.flagReason}</p>
                    ) : null}
                    {r.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-8 text-center text-sm text-navy/50">No users for this date / filter.</p>}
        </div>
        {!!rows.length && (
          <PaginationBar page={page} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>

      {flagDetail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-card">
            <div className="border-b border-navy/10 px-5 py-4">
              <h2 className="text-lg font-semibold">Flag location checks</h2>
              <p className="mt-1 text-sm text-navy/60">
                {flagDetail.name} · {flagDetail.phone} · {date}
              </p>
              <p className="mt-1 text-xs text-violet-800">
                {flagDetail.sameCount} valid checks at the same lat/lng (thirty-minute intervals)
              </p>
              <p className="mt-1 text-xs text-navy/50">
                Invalid / batch-uploaded rows (same GPS time) are ignored for flag count.
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs font-medium text-navy/60">
                <input
                  type="checkbox"
                  checked={flagShowAll}
                  onChange={(e) => setFlagShowAll(e.target.checked)}
                  className="rounded border-navy/20"
                />
                Show all interval checks (not only same-location group)
              </label>
            </div>
            <div className="overflow-auto px-5 py-4">
              {(flagShowAll ? flagDetail.sessions : [{ punchInAt: "", punchOutAt: null, snapshots: flagDetail.sameSnapshots }]).map(
                (sess, idx) => {
                  const list = flagShowAll ? sess.snapshots : flagDetail.sameSnapshots;
                  if (!list.length) {
                    return (
                      <p key={idx} className="text-sm text-navy/50">
                        No interval snapshots recorded yet.
                      </p>
                    );
                  }
                  return (
                    <div key={idx} className={flagShowAll && idx > 0 ? "mt-6 border-t border-navy/10 pt-4" : ""}>
                      {flagShowAll && "punchInAt" in sess && sess.punchInAt ? (
                        <p className="mb-2 text-xs font-semibold text-navy/55">
                          Session {idx + 1}: {fmtDateTime(sess.punchInAt)} → {fmtDateTime(sess.punchOutAt)}
                        </p>
                      ) : null}
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-[11px] font-semibold uppercase tracking-wider text-navy/45">
                          <tr>
                            <th className="px-2 py-2">#</th>
                            <th className="px-2 py-2">Due (IST)</th>
                            <th className="px-2 py-2">Interval</th>
                            <th className="px-2 py-2">Latitude</th>
                            <th className="px-2 py-2">Longitude</th>
                            <th className="px-2 py-2">GPS recorded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((snap, i) => (
                            <tr
                              key={`${snap.slot}-${i}`}
                              className={`border-t border-navy/5 ${
                                snap.valid === false
                                  ? "bg-red-50/60 opacity-70"
                                  : snap.sameGroup || !flagShowAll
                                    ? "bg-violet-50/80"
                                    : ""
                              }`}
                            >
                              <td className="px-2 py-2">{i + 1}</td>
                              <td className="px-2 py-2 text-xs whitespace-nowrap">
                                {snap.scheduledAt ? fmtDateTime(snap.scheduledAt) : "—"}
                              </td>
                              <td className="px-2 py-2 text-xs">{snap.slotLabel || `Slot ${snap.slot}`}</td>
                              <td className="px-2 py-2 font-mono text-xs">{snap.lat.toFixed(6)}</td>
                              <td className="px-2 py-2 font-mono text-xs">{snap.lng.toFixed(6)}</td>
                              <td className="px-2 py-2 text-xs text-navy/55">{fmtDateTime(snap.recordedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                }
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-navy/10 px-5 py-4">
              <button type="button" onClick={() => setFlagDetail(null)} className="admin-btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-card">
            <h2 className="text-lg font-semibold">Change attendance status</h2>
            <p className="mt-1 text-sm text-navy/60">
              {pending.name} → <span className="font-semibold">{statusTitle(pending.status)}</span>
            </p>
            <label className="mt-4 block text-xs font-medium text-navy/55">
              Reason (required)
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Why are you changing this status?"
                className="mt-1 w-full rounded-xl border border-navy/10 px-3 py-2 text-sm"
              />
            </label>
            {statusErr && <p className="mt-2 text-sm text-red-600">{statusErr}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setPending(null);
                  setReason("");
                  setStatusErr("");
                }}
                className="admin-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyStatus}
                disabled={busy === pending.userId}
                className="admin-btn-ink disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
