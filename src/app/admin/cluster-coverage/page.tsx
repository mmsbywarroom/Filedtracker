"use client";

import { useEffect, useState } from "react";
import { absentOrInProgressLabel } from "@/lib/dailyAttendance";

type Bucket = {
  alc: number;
  sectorIncharge: number;
  total: number;
  punched: number;
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
};

type Row = Bucket & {
  id: string;
  name: string;
  email: string;
  zone: string;
  district: string;
  cluster: string;
  assemblies: string[];
};

type Payload = {
  date: string;
  accessLevel: string;
  clusterAdmins: number;
  summary: Bucket;
  rows: Row[];
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function Stat({ label, value, hint, className }: { label: string; value: number; hint?: string; className: string }) {
  return (
    <div className={`rounded-2xl px-5 py-4 text-white shadow-card ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/70">{hint}</p> : null}
    </div>
  );
}

export default function ClusterCoveragePage() {
  const [date, setDate] = useState(todayIst);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setErr("");
    fetch(`/api/admin/cluster-coverage?date=${encodeURIComponent(date)}`)
      .then(async (res) => {
        if (res.status === 401) {
          window.location.href = "/admin/login";
          return null;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || "Could not load cluster coverage.");
        return json as Payload;
      })
      .then((json) => {
        if (!cancelled && json) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load cluster coverage.");
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  const summary = data?.summary;
  const absentLabel = absentOrInProgressLabel(date);

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
      <h1 className="text-2xl font-semibold text-ink">Cluster coverage</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy/55">
        Active ALC and Sector Incharge under each cluster admin. Counts follow your access
        {data?.accessLevel ? ` (${data.accessLevel})` : ""}. Left users are excluded.
      </p>

      <label className="mt-4 mb-5 block text-xs font-medium text-navy/55">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm"
        />
      </label>

      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Stat className="bg-ink" label="Cluster admins" value={data?.clusterAdmins || 0} />
        <Stat className="bg-[#12305A]" label="ALC" value={summary?.alc || 0} />
        <Stat className="bg-teal" label="Sector Incharge" value={summary?.sectorIncharge || 0} />
        <Stat className="bg-[#c45c12]" label="Punched in" value={summary?.punched || 0} />
        <Stat className="bg-emerald-700" label="Present" value={summary?.present || 0} />
        <Stat className="bg-amber-500" label="Half-day" value={summary?.halfDay || 0} />
        <Stat className="bg-red-600" label={absentLabel} value={summary?.absent || 0} hint="Not Present, Half-day, or Leave" />
        <Stat className="bg-sky-600" label="Leave" value={summary?.leave || 0} />
      </div>

      <section className="admin-panel mt-6 overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">Cluster admin</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Assemblies</th>
                <th className="px-4 py-3">ALC</th>
                <th className="px-4 py-3">Sector Incharge</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Punched in</th>
                <th className="px-4 py-3">Present</th>
                <th className="px-4 py-3">Half-day</th>
                <th className="px-4 py-3">{absentLabel}</th>
                <th className="px-4 py-3">Leave</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map((r) => (
                <tr key={r.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-ink">{r.name}</p>
                    {r.cluster ? <p className="text-xs text-navy/45">{r.cluster}</p> : null}
                  </td>
                  <td className="px-4 py-3">{r.zone || "—"}</td>
                  <td className="px-4 py-3">{r.district || "—"}</td>
                  <td className="px-4 py-3 text-xs text-navy/70">
                    {r.assemblies.length ? r.assemblies.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium tabular-nums">{r.alc}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">{r.sectorIncharge}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{r.total}</td>
                  <td className="px-4 py-3 tabular-nums text-[#c45c12]">{r.punched}</td>
                  <td className="px-4 py-3 tabular-nums text-emerald-700">{r.present}</td>
                  <td className="px-4 py-3 tabular-nums text-amber-700">{r.halfDay}</td>
                  <td className="px-4 py-3 tabular-nums text-red-700">{r.absent}</td>
                  <td className="px-4 py-3 tabular-nums text-sky-700">{r.leave}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.rows.length ? (
            <p className="p-6 text-sm text-navy/50">No cluster admins in your access.</p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
