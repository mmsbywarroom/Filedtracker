"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Row = {
  employeeId: string;
  employeeName: string;
  mobileNumber: string;
  designation: string;
  department?: string;
  team: string;
  assemblyName?: string;
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

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({ from, to, view });
      const res = await fetch(`/api/admin/location-security?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setRows(data.rows || []);
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

  async function openSession(row: Row) {
    setDetail(null);
    const q = new URLSearchParams();
    if (row.attendanceSessionId) q.set("attendanceSessionId", row.attendanceSessionId);
    if (row.punchId) q.set("punchId", row.punchId);
    const res = await fetch(`/api/admin/location-security/${row.employeeId}?${q}`);
    const data = await res.json();
    if (res.ok) setDetail(data);
    else setErr(data.error || "Failed to load timeline");
  }

  const isMockView = view === "mock";

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
              <code>isMock=true</code> / <code>MOCK_LOCATION_OS_SIGNAL</code>). VPN, Play Integrity, or heuristic-only
              cases are excluded. Status is always <strong>DIRECT OS MOCK SIGNAL</strong>. Punch is never blocked;
              employees are never warned.
            </>
          ) : (
            <>
              Supporting-only activity (VPN / Integrity / heuristics) without direct mock GPS. Not proof of fake GPS.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-navy/10 bg-white p-3">
        <label className="text-xs text-navy/60">
          From
          <input type="date" className="mt-1 block rounded border px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs text-navy/60">
          To
          <input type="date" className="mt-1 block rounded border px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs text-navy/60">
          List
          <select
            className="mt-1 block rounded border px-2 py-1"
            value={view}
            onChange={(e) => setView(e.target.value === "all" ? "all" : "mock")}
          >
            <option value="mock">Mock GPS only (main)</option>
            <option value="all">All security activity (optional)</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} className="rounded-lg bg-navy px-4 py-2 text-sm text-white">
          Refresh
        </button>
        <Link href="/admin/security-violations" className="text-sm text-teal underline">
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
              <th className="px-3 py-2">Punch In</th>
              <th className="px-3 py-2">Punch Out</th>
              <th className="px-3 py-2">Mock Events</th>
              {isMockView && (
                <>
                  <th className="px-3 py-2">First Mock Detected</th>
                  <th className="px-3 py-2">Last Mock Detected</th>
                </>
              )}
              <th className="px-3 py-2">Risk</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Timeline</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.punchId}-${r.attendanceSessionId || ""}-${r.lastMockAt || r.lastSuspiciousAt || ""}`} className="border-t border-navy/5">
                <td className="px-3 py-2">
                  <div className="font-medium text-navy">{r.employeeName || "—"}</div>
                  <div className="text-xs text-navy/45">{r.team || r.assemblyName || "—"}</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{r.mobileNumber || "—"}</td>
                <td className="px-3 py-2">{r.designation || "—"}</td>
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
                <td className="px-3 py-2">
                  <button type="button" className="text-teal underline" onClick={() => void openSession(r)}>
                    Timeline
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={isMockView ? 11 : 9} className="px-3 py-8 text-center text-navy/40">
                  {isMockView
                    ? "No direct mock-GPS sessions in this range."
                    : "No supporting-only security activity in this range."}
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
                <div>
                  {detail.employee?.designation}
                  {detail.employee?.team ? ` · ${detail.employee.team}` : ""}
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
                <div className="mt-1 text-xs text-navy/55">
                  First mock: {whenIst(detail.session?.firstSuspiciousAt)} · Last:{" "}
                  {whenIst(detail.session?.lastSuspiciousAt)}
                </div>
                <div className="mt-1 text-xs text-navy/55">
                  Device: {detail.session?.deviceModel || "—"} · Install:{" "}
                  {detail.session?.appInstallationId || "—"}
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
