"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LazyFacePhoto } from "@/components/LazyFacePhoto";
import { AdminReportToolbar } from "@/components/AdminReportToolbar";
import { PaginationBar } from "@/components/PaginationBar";
import { downloadCsv, downloadPdf, reasonLabel, uniqueSorted } from "@/lib/reportExport";
import { formatKm } from "@/lib/utils";
import { clientSourceLabel } from "@/lib/clientSource";

type Row = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  assemblyName: string;
  designation: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  faceRegistered?: boolean;
  hasPunchInFace?: boolean;
  hasPunchOutFace?: boolean;
  punchInAt: string;
  punchOutAt: string | null;
  punchInLat: number;
  punchInLng: number;
  punchOutLat: number | null;
  punchOutLng: number | null;
  punchInAddress: string | null;
  punchOutAddress: string | null;
  distanceMeters: number;
  marks: number;
  status: string;
  punchOutReason?: string | null;
  punchInClient?: string | null;
  punchOutClient?: string | null;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function whenIst(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
}

function fmtCoord(n: number | null | undefined) {
  return n != null && Number.isFinite(n) ? n.toFixed(6) : "—";
}

function rowReason(r: Row) {
  if (!r.punchOutAt) return "live";
  if (r.punchOutReason === "gps_off") return "gps_off";
  if (r.punchOutReason === "auto_12h") return "auto_12h";
  if (r.punchOutReason === "auto_geofence") return "auto_geofence";
  if (r.punchOutReason === "admin_present") return "admin_present";
  return "manual";
}

export default function DailyRecordsPage() {
  const [date, setDate] = useState(todayIst);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [designation, setDesignation] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  async function load(d: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/attendance?date=${d}`);
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(data.records || []);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(date);
  }, [date]);

  const zones = useMemo(() => uniqueSorted(rows.map((r) => r.zone)), [rows]);
  const districts = useMemo(
    () => uniqueSorted(rows.filter((r) => !zone || r.zone === zone).map((r) => r.district)),
    [rows, zone]
  );
  const designations = useMemo(() => uniqueSorted(rows.map((r) => r.designation)), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const text = [r.name, r.phone, r.assemblyName, r.sectorAllotted, r.zone, r.district, r.designation]
        .join(" ")
        .toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (zone && r.zone !== zone) return false;
      if (district && r.district !== district) return false;
      if (designation && r.designation !== designation) return false;
      if (reason && rowReason(r) !== reason) return false;
      return true;
    });
  }, [rows, q, zone, district, designation, reason]);

  useEffect(() => {
    setPage(1);
  }, [q, zone, district, designation, reason, pageSize]);

  const pageRows = useMemo(
    () => filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [filtered, page, pageSize]
  );

  const live = rows.filter((r) => r.status === "Live").length;
  const done = rows.filter((r) => r.status === "Completed").length;

  const exportHeaders = [
    "Name",
    "Phone",
    "Zone",
    "District",
    "Designation",
    "Assembly",
    "Sector",
    "Punch in",
    "Punch in via",
    "Punch in lat",
    "Punch in lng",
    "Punch out",
    "Punch out via",
    "Punch out lat",
    "Punch out lng",
    "Distance",
    "Marks",
    "Status",
    "Reason",
  ];
  const exportRows = filtered.map((r) => [
    r.name,
    r.phone,
    r.zone,
    r.district,
    r.designation,
    r.assemblyName,
    r.sectorAllotted,
    whenIst(r.punchInAt),
    clientSourceLabel(r.punchInClient),
    fmtCoord(r.punchInLat),
    fmtCoord(r.punchInLng),
    whenIst(r.punchOutAt),
    clientSourceLabel(r.punchOutClient),
    fmtCoord(r.punchOutLat),
    fmtCoord(r.punchOutLng),
    formatKm(r.distanceMeters || 0),
    r.marks,
    r.status,
    reasonLabel(r.punchOutReason, r.punchOutAt),
  ]);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
      <h1 className="text-2xl font-semibold">Daily records</h1>
      <p className="mt-1 text-sm text-navy/60">
        {loading ? "Loading…" : `${rows.length} punches · ${live} live · ${done} completed`}
      </p>

      <AdminReportToolbar
        date={date}
        onDate={setDate}
        q={q}
        onQ={setQ}
        qPlaceholder="Search user…"
        zone={zone}
        onZone={(v) => {
          setZone(v);
          setDistrict("");
        }}
        zones={zones}
        district={district}
        onDistrict={setDistrict}
        districts={districts}
        designation={designation}
        onDesignation={setDesignation}
        designations={designations}
        reason={reason}
        onReason={setReason}
        reasons={[
          { value: "live", label: "Live (no punch-out)" },
          { value: "manual", label: "Manual punch-out" },
          { value: "gps_off", label: "GPS off" },
          { value: "auto_12h", label: "Auto · 12 hours" },
          { value: "auto_geofence", label: "Auto · left 1000 m boundary" },
          { value: "admin_present", label: "Manual present by admin" },
        ]}
        onCsv={() => downloadCsv(`daily-records-${date}`, exportHeaders, exportRows)}
        onPdf={() => downloadPdf(`Daily records · ${date}`, exportHeaders, exportRows)}
      />

      <section className="admin-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-sand/70 text-xs uppercase tracking-wide text-navy/50">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Number</th>
                <th className="px-3 py-3">Zone</th>
                <th className="px-3 py-3">District</th>
                <th className="px-3 py-3">Designation</th>
                <th className="px-3 py-3">Sector</th>
                <th className="px-3 py-3">Registered</th>
                <th className="px-3 py-3">Punch in</th>
                <th className="px-3 py-3">In via</th>
                <th className="px-3 py-3">In lat</th>
                <th className="px-3 py-3">In lng</th>
                <th className="px-3 py-3">In face</th>
                <th className="px-3 py-3">Punch out</th>
                <th className="px-3 py-3">Out via</th>
                <th className="px-3 py-3">Out lat</th>
                <th className="px-3 py-3">Out lng</th>
                <th className="px-3 py-3">Out face</th>
                <th className="px-3 py-3">Distance</th>
                <th className="px-3 py-3">Marks</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Reason</th>
                <th className="px-3 py-3">Map</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-t border-navy/5 align-top">
                  <td className="px-3 py-3 font-medium">{r.name}</td>
                  <td className="px-3 py-3">{r.phone}</td>
                  <td className="px-3 py-3">{r.zone}</td>
                  <td className="px-3 py-3">{r.district}</td>
                  <td className="px-3 py-3">{r.designation}</td>
                  <td className="px-3 py-3">{r.sectorAllotted}</td>
                  <td className="px-3 py-3">
                    <LazyFacePhoto
                      attendanceId={r.id}
                      kind="registered"
                      label={`${r.name} registered`}
                      available={r.faceRegistered}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {new Date(r.punchInAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
                    {r.punchInAddress ? <p className="max-w-[160px] text-xs text-navy/50">{r.punchInAddress}</p> : null}
                  </td>
                  <td className="px-3 py-3 text-xs">{clientSourceLabel(r.punchInClient)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{fmtCoord(r.punchInLat)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{fmtCoord(r.punchInLng)}</td>
                  <td className="px-3 py-3">
                    <LazyFacePhoto
                      attendanceId={r.id}
                      kind="in"
                      label={`${r.name} punch in`}
                      available={r.hasPunchInFace}
                    />
                  </td>
                  <td className="px-3 py-3">
                    {r.punchOutAt
                      ? new Date(r.punchOutAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })
                      : "—"}
                    {r.punchOutAddress ? <p className="max-w-[160px] text-xs text-navy/50">{r.punchOutAddress}</p> : null}
                  </td>
                  <td className="px-3 py-3 text-xs">{clientSourceLabel(r.punchOutClient)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{fmtCoord(r.punchOutLat)}</td>
                  <td className="px-3 py-3 font-mono text-xs">{fmtCoord(r.punchOutLng)}</td>
                  <td className="px-3 py-3">
                    <LazyFacePhoto
                      attendanceId={r.id}
                      kind="out"
                      label={`${r.name} punch out`}
                      available={r.hasPunchOutFace}
                    />
                  </td>
                  <td className="px-3 py-3">{formatKm(r.distanceMeters || 0)}</td>
                  <td className="px-3 py-3">{r.marks}</td>
                  <td className="px-3 py-3">{r.status}</td>
                  <td className="px-3 py-3 text-xs">{reasonLabel(r.punchOutReason, r.punchOutAt)}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/users/${r.userId}`} className="admin-btn-teal-soft admin-btn-sm">
                      Footprint
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <p className="p-6 text-sm text-navy/50">Loading records…</p>}
          {!loading && !filtered.length && <p className="p-6 text-sm text-navy/50">No records for this date.</p>}
        </div>
        {!loading && !!filtered.length && (
          <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
        )}
      </section>
    </main>
  );
}
