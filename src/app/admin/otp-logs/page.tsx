"use client";

import { useEffect, useState } from "react";
import { downloadCsv } from "@/lib/reportExport";

type Row = {
  id: string;
  phone: string;
  outcome: string;
  detail: string;
  ip: string;
  userAgent: string;
  clientSource: string;
  appInstallationId: string;
  androidId: string;
  appVersion: string;
  manufacturer: string;
  model: string;
  createdAt: string;
  employeeId: string | null;
  employeeName: string | null;
  designation: string | null;
  zone: string | null;
  district: string | null;
  assemblyName: string | null;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function whenIst(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export default function OtpLogsAdminPage() {
  const [from, setFrom] = useState(todayIst());
  const [to, setTo] = useState(todayIst());
  const [phone, setPhone] = useState("9625692122");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const q = new URLSearchParams({ from, to });
      if (phone.trim()) q.set("phone", phone.trim());
      const res = await fetch(`/api/admin/otp-logs?${q}`);
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

  function exportCsv() {
    downloadCsv(
      `otp-logs_${from}_to_${to}.csv`,
      [
        "When",
        "Phone",
        "Employee",
        "Designation",
        "Zone",
        "District",
        "Assembly",
        "Outcome",
        "Detail",
        "IP",
        "Client",
        "AppInstallationId",
        "AndroidId",
        "Device",
        "AppVersion",
        "UserAgent",
      ],
      rows.map((r) => [
        whenIst(r.createdAt),
        r.phone,
        r.employeeName || "",
        r.designation || "",
        r.zone || "",
        r.district || "",
        r.assemblyName || "",
        r.outcome,
        r.detail,
        r.ip,
        r.clientSource,
        r.appInstallationId,
        r.androidId,
        `${r.manufacturer} ${r.model}`.trim(),
        r.appVersion,
        r.userAgent,
      ])
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold text-navy">OTP request logs</h1>
        <p className="mt-1 max-w-3xl text-sm text-navy/60">
          Forensic log of who requested OTP SMS: IP, device install ID, Android ID, user-agent. Super admin only.
          Limits: ~90s cooldown, max 3 OTP/hour per number.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-navy/10 bg-white p-3">
        <label className="text-xs font-semibold text-navy/60">
          From
          <input type="date" className="mt-1 block rounded border px-2 py-1" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-navy/60">
          To
          <input type="date" className="mt-1 block rounded border px-2 py-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-navy/60">
          Phone
          <input
            className="mt-1 block rounded border px-2 py-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9625692122"
          />
        </label>
        <button type="button" onClick={() => void load()} className="rounded-lg bg-navy px-4 py-2 text-sm text-white">
          Search
        </button>
        <button type="button" onClick={exportCsv} className="rounded-lg border px-4 py-2 text-sm">
          CSV
        </button>
      </div>

      {err && <p className="text-sm text-rose-700">{err}</p>}
      {loading && <p className="text-sm text-navy/50">Loading…</p>}

      <div className="overflow-x-auto rounded-xl border border-navy/10 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-sand/60 text-xs uppercase text-navy/50">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Phone / User</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Device / Install</th>
              <th className="px-3 py-2">Client</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-navy/5 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-xs">{whenIst(r.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.phone}</div>
                  <div className="text-xs text-navy/55">{r.employeeName || "—"}</div>
                  <div className="text-xs text-navy/40">
                    {[r.designation, r.zone, r.district, r.assemblyName].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-semibold">{r.outcome}</div>
                  <div className="text-xs text-navy/50">{r.detail}</div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.ip || "—"}</td>
                <td className="px-3 py-2 text-xs">
                  <div>
                    {r.manufacturer} {r.model}
                  </div>
                  <div className="font-mono break-all">install: {r.appInstallationId || "—"}</div>
                  <div className="font-mono break-all">androidId: {r.androidId || "—"}</div>
                  <div>v{r.appVersion || "—"}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  <div>{r.clientSource}</div>
                  <div className="max-w-[220px] break-all text-navy/45">{r.userAgent || "—"}</div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-navy/40">
                  No OTP request logs in this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
