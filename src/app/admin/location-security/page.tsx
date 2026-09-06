"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { downloadCsv, uniqueSorted } from "@/lib/reportExport";

type Row = {
  employeeId: string;
  employeeName: string;
  mobileNumber: string;
  designation: string;
  department?: string;
  team?: string;
  assemblyName?: string;
  zone?: string;
  district?: string;
  cluster?: string;
  attendanceSessionId: string | null;
  punchId: string;
  punchType?: string;
  punchInAt: string | null;
  punchOutAt: string | null;
  deviceModel?: string;
  appInstallationId?: string;
  securityStatus: string;
  riskScore: number;
  mockLocationEventCount: number;
  mockLocationDetected?: boolean;
  firstMockAt?: string | null;
  lastMockAt?: string | null;
  firstSuspiciousAt?: string | null;
  lastSuspiciousAt?: string | null;
  supportingOnly?: boolean;
};

type DetailPayload = {
  employee?: {
    employeeId: string;
    employeeName: string;
    mobileNumber: string;
    designation: string;
    department: string;
    team: string;
    assemblyName: string;
    zone: string;
    district: string;
    cluster: string;
    sectorAllotted: string;
  };
  session?: {
    attendanceSessionId: string | null;
    punchId: string | null;
    punchType: string | null;
    punchInAt: string | null;
    punchOutAt: string | null;
    securityStatus: string;
    riskScore: number;
    mockLocationEventCount: number;
    firstSuspiciousAt: string | null;
    lastSuspiciousAt: string | null;
    deviceModel: string;
    appInstallationId: string;
  };
  summaries?: unknown[];
  events?: unknown[];
  samples?: unknown[];
  devices?: unknown[];
  attendance?: unknown[];
};

type SummaryFilter = "" | "mock" | "open" | "closed" | "highRisk";

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function whenIst(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function statusCls(s: string) {
  if (s === "DIRECT_MOCK_SIGNAL") return "bg-rose-100 text-rose-900";
  if (s === "HIGH_RISK") return "bg-orange-100 text-orange-900";
  if (s === "WATCH") return "bg-amber-100 text-amber-900";
  return "bg-emerald-50 text-emerald-900";
}

function statusLabel(s: string) {
  if (s === "DIRECT_MOCK_SIGNAL") return "DIRECT OS MOCK SIGNAL";
  return s;
}

export default function LocationSecurityAdminPage() {
  const [from, setFrom] = useState(todayIst());
  const [to, setTo] = useState(todayIst());
  const [view, setView] = useState<"mock" | "all">("mock");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [assembly, setAssembly] = useState("");
  const [designation, setDesignation] = useState("");
  /** Default true on mock view — only sessions with mockLocationDetected. */
  const [mockDetectedOnly, setMockDetectedOnly] = useState(true);
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({ from, to, view });
      const res = await fetch(`/api/admin/location-security?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setRows(data.rows || []);
      setSummaryFilter("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMockView = view === "mock";

  const zones = useMemo(() => uniqueSorted(rows.map((r) => r.zone)), [rows]);
  const districts = useMemo(
    () => uniqueSorted(rows.filter((r) => !zone || r.zone === zone).map((r) => r.district)),
    [rows, zone]
  );
  const assemblies = useMemo(
    () =>
      uniqueSorted(
        rows
          .filter((r) => (!zone || r.zone === zone) && (!district || r.district === district))
          .map((r) => r.assemblyName)
      ),
    [rows, zone, district]
  );
  const designations = useMemo(() => uniqueSorted(rows.map((r) => r.designation)), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const isMock = Boolean(r.mockLocationDetected) || r.securityStatus === "DIRECT_MOCK_SIGNAL" || (r.mockLocationEventCount || 0) > 0;
      if (mockDetectedOnly && !isMock) return false;
      if (zone && (r.zone || "") !== zone) return false;
      if (district && (r.district || "") !== district) return false;
      if (assembly && (r.assemblyName || "") !== assembly) return false;
      if (designation && (r.designation || "") !== designation) return false;
      if (summaryFilter === "mock" && !isMock) return false;
      if (summaryFilter === "open" && r.punchOutAt) return false;
      if (summaryFilter === "closed" && !r.punchOutAt) return false;
      if (summaryFilter === "highRisk" && (r.riskScore || 0) < 150) return false;
      if (needle) {
        const hay = [
          r.employeeName,
          r.mobileNumber,
          r.designation,
          r.zone,
          r.district,
          r.assemblyName,
          r.attendanceSessionId,
          r.punchId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, zone, district, assembly, designation, mockDetectedOnly, summaryFilter]);

  const summary = useMemo(() => {
    const mockSessions = rows.filter(
      (r) => Boolean(r.mockLocationDetected) || r.securityStatus === "DIRECT_MOCK_SIGNAL" || (r.mockLocationEventCount || 0) > 0
    ).length;
    const openSessions = rows.filter((r) => !r.punchOutAt).length;
    const closedSessions = rows.filter((r) => Boolean(r.punchOutAt)).length;
    const highRisk = rows.filter((r) => (r.riskScore || 0) >= 150).length;
    const totalMockEvents = rows.reduce((n, r) => n + (r.mockLocationEventCount || 0), 0);
    const employees = new Set(rows.map((r) => r.employeeId)).size;
    return {
      totalSessions: rows.length,
      mockSessions,
      openSessions,
      closedSessions,
      highRisk,
      totalMockEvents,
      employees,
      showing: filtered.length,
    };
  }, [rows, filtered.length]);

  function toggleSummary(next: SummaryFilter) {
    setSummaryFilter((cur) => (cur === next ? "" : next));
    if (next === "mock") setMockDetectedOnly(true);
  }

  async function openSession(row: Row) {
    setDetail(null);
    const params = new URLSearchParams();
    if (row.attendanceSessionId) params.set("attendanceSessionId", row.attendanceSessionId);
    if (row.punchId) params.set("punchId", row.punchId);
    const res = await fetch(`/api/admin/location-security/${row.employeeId}?${params}`);
    const data = await res.json();
    if (res.ok) setDetail(data);
    else setErr(data.error || "Failed to load timeline");
  }

  function exportCsv() {
    const headers = [
      "Name",
      "Mobile",
      "Designation",
      "Zone",
      "District",
      "Assembly",
      "Punch In",
      "Punch Out",
      "Mock Events",
      "First Mock Detected",
      "Last Mock Detected",
      "Risk",
      "Status",
      "mockLocationDetected",
      "Attendance Session ID",
      "Punch ID",
      "Employee ID",
      "Device",
      "App Installation ID",
    ];
    const exportRows = filtered.map((r) => {
      const isMock =
        Boolean(r.mockLocationDetected) ||
        r.securityStatus === "DIRECT_MOCK_SIGNAL" ||
        (r.mockLocationEventCount || 0) > 0;
      return [
        r.employeeName,
        r.mobileNumber,
        r.designation,
        r.zone || "",
        r.district || "",
        r.assemblyName || "",
        whenIst(r.punchInAt),
        whenIst(r.punchOutAt),
        r.mockLocationEventCount,
        whenIst(r.firstMockAt || r.firstSuspiciousAt),
        whenIst(r.lastMockAt || r.lastSuspiciousAt),
        r.riskScore,
        statusLabel(r.securityStatus),
        isMock ? "true" : "false",
        r.attendanceSessionId || "",
        r.punchId || "",
        r.employeeId,
        r.deviceModel || "",
        r.appInstallationId || "",
      ];
    });
    downloadCsv(`fake-gps-sessions_${from}_to_${to}.csv`, headers, exportRows);
  }

  const field =
    "mt-1 block h-10 w-full min-w-[140px] rounded-xl border border-navy/15 bg-white px-3 text-sm shadow-sm";

  const summaryCards: {
    key: SummaryFilter | "total" | "events" | "employees" | "showing";
    label: string;
    value: number;
    clickable?: SummaryFilter;
    active?: boolean;
  }[] = [
    { key: "total", label: "Sessions loaded", value: summary.totalSessions },
    {
      key: "mock",
      label: "Mock GPS sessions",
      value: summary.mockSessions,
      clickable: "mock",
      active: summaryFilter === "mock",
    },
    {
      key: "open",
      label: "Still punched in",
      value: summary.openSessions,
      clickable: "open",
      active: summaryFilter === "open",
    },
    {
      key: "closed",
      label: "Punched out",
      value: summary.closedSessions,
      clickable: "closed",
      active: summaryFilter === "closed",
    },
    {
      key: "highRisk",
      label: "High risk (≥150)",
      value: summary.highRisk,
      clickable: "highRisk",
      active: summaryFilter === "highRisk",
    },
    { key: "events", label: "Total mock events", value: summary.totalMockEvents },
    { key: "employees", label: "Unique employees", value: summary.employees },
    { key: "showing", label: "Showing (filtered)", value: summary.showing },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-navy">
          {isMockView ? "Fake GPS / mock location sessions" : "All security activity (supporting)"}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-navy/60">
          {isMockView ? (
            <>
              Main list shows <strong>only</strong> attendance sessions with direct Android OS mock evidence (
              <code>isMock=true</code> / <code>MOCK_LOCATION_OS_SIGNAL</code>). Status is always{" "}
              <strong>DIRECT OS MOCK SIGNAL</strong>. Punch is never blocked; employees are never warned.
            </>
          ) : (
            <>Supporting-only activity (VPN / Integrity / heuristics) without direct mock GPS.</>
          )}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {summaryCards.map((c) => {
          const clickable = Boolean(c.clickable);
          const active = Boolean(c.active);
          const className = `rounded-xl border px-3 py-3 text-left transition ${
            active
              ? "border-rose-300 bg-rose-50 ring-2 ring-rose-200"
              : clickable
                ? "border-navy/10 bg-white hover:border-teal/40 hover:bg-sand/40"
                : "border-navy/10 bg-white"
          }`;
          const body = (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-navy/45">{c.label}</div>
              <div className="mt-1 text-2xl font-semibold text-navy">{c.value}</div>
              {clickable && <div className="mt-1 text-[10px] text-teal">{active ? "Click to clear" : "Click to filter"}</div>}
            </>
          );
          if (clickable && c.clickable) {
            return (
              <button key={c.key} type="button" className={className} onClick={() => toggleSummary(c.clickable!)}>
                {body}
              </button>
            );
          }
          return (
            <div key={c.key} className={className}>
              {body}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-navy/10 bg-white p-3">
        <label className="text-xs font-semibold text-navy/60">
          From
          <input type="date" className={field} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-navy/60">
          To
          <input type="date" className={field} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-navy/60">
          List
          <select
            className={field}
            value={view}
            onChange={(e) => {
              const next = e.target.value === "all" ? "all" : "mock";
              setView(next);
              setMockDetectedOnly(next === "mock");
            }}
          >
            <option value="mock">Mock GPS only (main)</option>
            <option value="all">All security activity (optional)</option>
          </select>
        </label>
        <label className="min-w-[200px] flex-1 text-xs font-semibold text-navy/60">
          Search
          <input
            className={field}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, mobile, zone, district, assembly…"
          />
        </label>
        <label className="text-xs font-semibold text-navy/60">
          Zone
          <select
            className={field}
            value={zone}
            onChange={(e) => {
              setZone(e.target.value);
              setDistrict("");
              setAssembly("");
            }}
          >
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-navy/60">
          District
          <select
            className={field}
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setAssembly("");
            }}
          >
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-navy/60">
          Assembly
          <select className={field} value={assembly} onChange={(e) => setAssembly(e.target.value)}>
            <option value="">All assemblies</option>
            {assemblies.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-navy/60">
          Designation
          <select className={field} value={designation} onChange={(e) => setDesignation(e.target.value)}>
            <option value="">All designations</option>
            {designations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 self-end rounded-xl border border-navy/15 bg-sand/40 px-3 text-xs font-semibold text-navy/70">
          <input
            type="checkbox"
            checked={mockDetectedOnly}
            onChange={(e) => setMockDetectedOnly(e.target.checked)}
          />
          mockLocationDetected: true
        </label>
        <button type="button" onClick={() => void load()} className="h-10 rounded-lg bg-navy px-4 text-sm text-white">
          Search
        </button>
        <button
          type="button"
          onClick={exportCsv}
          className="h-10 rounded-lg border border-navy/20 bg-white px-4 text-sm font-medium text-navy"
        >
          Download CSV
        </button>
        <Link href="/admin/security-violations" className="self-end pb-2 text-sm text-teal underline">
          Legacy punch evidence
        </Link>
      </div>

      {err && <p className="text-sm text-rose-700">{err}</p>}
      {loading && <p className="text-sm text-navy/50">Loading…</p>}

      <div className="overflow-x-auto rounded-xl border border-navy/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sand/60 text-xs uppercase text-navy/50">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Mobile</th>
              <th className="px-3 py-2">Designation</th>
              <th className="px-3 py-2">Zone</th>
              <th className="px-3 py-2">District</th>
              <th className="px-3 py-2">Assembly</th>
              <th className="px-3 py-2">Punch In</th>
              <th className="px-3 py-2">Punch Out</th>
              <th className="px-3 py-2">Mock Events</th>
              {isMockView && (
                <>
                  <th className="px-3 py-2">First Mock</th>
                  <th className="px-3 py-2">Last Mock</th>
                </>
              )}
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">mockLocationDetected</th>
              <th className="px-3 py-2">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isMock =
                Boolean(r.mockLocationDetected) ||
                r.securityStatus === "DIRECT_MOCK_SIGNAL" ||
                (r.mockLocationEventCount || 0) > 0;
              return (
                <tr
                  key={`${r.punchId}-${r.attendanceSessionId || ""}-${r.lastMockAt || r.lastSuspiciousAt || ""}`}
                  className="border-t border-navy/5"
                >
                  <td className="px-3 py-2 font-medium text-navy">{r.employeeName || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{r.mobileNumber || "—"}</td>
                  <td className="px-3 py-2">{r.designation || "—"}</td>
                  <td className="px-3 py-2">{r.zone || "—"}</td>
                  <td className="px-3 py-2">{r.district || "—"}</td>
                  <td className="px-3 py-2">{r.assemblyName || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{whenIst(r.punchInAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs">{whenIst(r.punchOutAt)}</td>
                  <td className="px-3 py-2 font-semibold">{r.mockLocationEventCount}</td>
                  {isMockView && (
                    <>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{whenIst(r.firstMockAt || r.firstSuspiciousAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{whenIst(r.lastMockAt || r.lastSuspiciousAt)}</td>
                    </>
                  )}
                  <td className="px-3 py-2 font-semibold">{r.riskScore}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusCls(r.securityStatus)}`}>
                      {statusLabel(r.securityStatus)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{isMock ? "true" : "false"}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-teal underline" onClick={() => void openSession(r)}>
                      Timeline
                    </button>
                  </td>
                </tr>
              );
            })}
            {!filtered.length && !loading && (
              <tr>
                <td colSpan={isMockView ? 15 : 13} className="px-3 py-8 text-center text-navy/40">
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-navy">
                  {detail.employee?.employeeName || "Employee"} — session evidence
                </h2>
                <p className="mt-1 text-xs text-navy/55">
                  Mock wording: “Android OS reported this location as mock” — not automatic fraud conviction.
                </p>
              </div>
              <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>

            <section className="mt-4 grid gap-2 rounded-xl border border-navy/10 bg-sand/30 p-3 text-sm md:grid-cols-2">
              <div>
                <div className="text-xs uppercase text-navy/45">Employee</div>
                <div className="font-medium">{detail.employee?.employeeName}</div>
                <div className="text-xs text-navy/55">ID: {detail.employee?.employeeId}</div>
                <div>{detail.employee?.mobileNumber}</div>
                <div>{detail.employee?.designation}</div>
                <div className="mt-1 text-xs text-navy/55">
                  Zone: {detail.employee?.zone || "—"} · District: {detail.employee?.district || "—"} · Assembly:{" "}
                  {detail.employee?.assemblyName || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-navy/45">Session</div>
                <div className="text-xs">Attendance: {detail.session?.attendanceSessionId || "—"}</div>
                <div className="text-xs">Punch ID: {detail.session?.punchId || "—"}</div>
                <div>In: {whenIst(detail.session?.punchInAt)}</div>
                <div>Out: {whenIst(detail.session?.punchOutAt)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusCls(detail.session?.securityStatus || "NORMAL")}`}>
                    {statusLabel(detail.session?.securityStatus || "NORMAL")}
                  </span>
                  <span className="text-xs">Risk {detail.session?.riskScore ?? 0}</span>
                  <span className="text-xs">Mock events {detail.session?.mockLocationEventCount ?? 0}</span>
                </div>
              </div>
            </section>

            <section className="mt-4">
              <h3 className="text-sm font-semibold text-navy">Devices / installs</h3>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-sand/40 p-2 text-xs">
                {JSON.stringify(detail.devices, null, 2)}
              </pre>
            </section>
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-navy">Punch security summaries</h3>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-sand/40 p-2 text-xs">
                {JSON.stringify(detail.summaries, null, 2)}
              </pre>
            </section>
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-navy">Events timeline</h3>
              <pre className="mt-1 max-h-56 overflow-auto rounded bg-sand/40 p-2 text-xs">
                {JSON.stringify(detail.events, null, 2)}
              </pre>
            </section>
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-navy">Location samples (technical evidence)</h3>
              <pre className="mt-1 max-h-56 overflow-auto rounded bg-sand/40 p-2 text-xs">
                {JSON.stringify(detail.samples, null, 2)}
              </pre>
            </section>
            <section className="mt-4">
              <h3 className="text-sm font-semibold text-navy">Attendance sessions</h3>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-sand/40 p-2 text-xs">
                {JSON.stringify(detail.attendance, null, 2)}
              </pre>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
