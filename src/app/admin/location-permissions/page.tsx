"use client";

import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { AdminReportToolbar } from "@/components/AdminReportToolbar";
import { downloadCsv, downloadPdf, uniqueSorted } from "@/lib/reportExport";

type Row = {
  id: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  alwaysStatus: "always" | "while_using" | "denied" | "unknown";
  platform: string | null;
  updatedAt: string | null;
};

function whenIst(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
}

function statusLabel(s: Row["alwaysStatus"]) {
  if (s === "always") return "Always allow";
  if (s === "while_using") return "While using only";
  if (s === "denied") return "No location";
  return "Not reported yet";
}

function statusClass(s: Row["alwaysStatus"]) {
  if (s === "always") return "bg-emerald-100 text-emerald-800";
  if (s === "while_using") return "bg-amber-100 text-amber-900";
  if (s === "denied") return "bg-red-100 text-red-800";
  return "bg-navy/10 text-navy/60";
}

export default function LocationPermissionsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ total: 0, always: 0, whileUsing: 0, denied: 0, unknown: 0 });
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [designation, setDesignation] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const res = await fetch(`/api/admin/location-permissions?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setRows(data.users || []);
    setSummary(data.summary || { total: 0, always: 0, whileUsing: 0, denied: 0, unknown: 0 });
    setPage(1);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const zones = useMemo(() => uniqueSorted(rows.map((r) => r.zone)), [rows]);
  const districts = useMemo(
    () => uniqueSorted(rows.filter((r) => !zone || r.zone === zone).map((r) => r.district)),
    [rows, zone]
  );
  const designations = useMemo(() => uniqueSorted(rows.map((r) => r.designation)), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (zone && r.zone !== zone) return false;
      if (district && r.district !== district) return false;
      if (designation && r.designation !== designation) return false;
      return true;
    });
  }, [rows, zone, district, designation]);

  const pageRows = filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  const exportHeaders = [
    "Name",
    "Phone",
    "Designation",
    "Assembly",
    "Sector",
    "Zone",
    "District",
    "Always location",
    "Platform",
    "Last reported",
  ];
  const exportRows = filtered.map((r) => [
    r.name,
    r.phone,
    r.designation,
    r.assemblyName,
    r.sectorAllotted,
    r.zone,
    r.district,
    statusLabel(r.alwaysStatus),
    r.platform || "",
    whenIst(r.updatedAt),
  ]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Native app</p>
      <h1 className="text-2xl font-semibold">Always location permission</h1>
      <p className="mt-1 text-sm text-navy/55">
        Who granted <strong>Allow all the time / Always</strong> on Android or iOS. Updates when the user opens the
        latest native app. Older APKs show as &quot;Not reported yet&quot; until they update.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Shown", value: summary.total },
          { label: "Always allow", value: summary.always },
          { label: "While using only", value: summary.whileUsing },
          { label: "No location", value: summary.denied },
          { label: "Not reported", value: summary.unknown },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl border border-navy/10 bg-white px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-navy/45">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-navy">{loading ? "…" : c.value}</p>
          </div>
        ))}
      </div>

      <AdminReportToolbar
        q={q}
        onQ={setQ}
        qPlaceholder="Search name, number, assembly"
        zone={zone}
        onZone={(v) => {
          setZone(v);
          setDistrict("");
          setPage(1);
        }}
        zones={zones}
        district={district}
        onDistrict={(v) => {
          setDistrict(v);
          setPage(1);
        }}
        districts={districts}
        designation={designation}
        onDesignation={(v) => {
          setDesignation(v);
          setPage(1);
        }}
        designations={designations}
        reason={status}
        onReason={(v) => {
          setStatus(v);
          setPage(1);
        }}
        reasonLabel="Always location"
        reasons={[
          { value: "always", label: "Always allow" },
          { value: "while_using", label: "While using only" },
          { value: "denied", label: "No location" },
          { value: "unknown", label: "Not reported yet" },
          { value: "not_always", label: "Not Always (all issues)" },
        ]}
        onApply={load}
        onCsv={() => downloadCsv("location-always-allow", exportHeaders, exportRows)}
        onPdf={() => downloadPdf("Always location (native)", exportHeaders, exportRows)}
      />

      <section className="admin-panel overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Always location</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Assembly / Sector</th>
                <th className="px-4 py-3">Zone / District</th>
                <th className="px-4 py-3">Last reported</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-navy/50">
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-navy/50">
                    No users match.
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => (
                  <tr key={r.id} className="border-t border-navy/5">
                    <td className="px-4 py-3">
                      <p className="font-medium text-navy">{r.name}</p>
                      <p className="text-xs text-navy/50">{r.phone}</p>
                      <p className="text-xs text-navy/40">{r.designation}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(r.alwaysStatus)}`}>
                        {statusLabel(r.alwaysStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-navy/70">{r.platform || "—"}</td>
                    <td className="px-4 py-3 text-navy/70">
                      {r.assemblyName}
                      <div className="text-xs text-navy/45">{r.sectorAllotted}</div>
                    </td>
                    <td className="px-4 py-3 text-navy/70">
                      {r.zone}
                      <div className="text-xs text-navy/45">{r.district}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-navy/55">{whenIst(r.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </section>
    </main>
  );
}
