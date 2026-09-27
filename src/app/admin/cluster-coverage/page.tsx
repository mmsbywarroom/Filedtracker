"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { absentOrInProgressLabel } from "@/lib/dailyAttendance";
import { downloadCsv, downloadPdf, type PdfSummaryCard } from "@/lib/reportExport";

type Metric = "alc" | "sectorIncharge" | "total" | "punched" | "present" | "halfDay" | "absent" | "leave";

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

type Person = {
  id: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  clusterAdminId: string;
  clusterAdminName: string;
  status: string;
  statusLabel: string;
  punched: boolean;
};

type Payload = {
  date: string;
  accessLevel: string;
  clusterAdmins: number;
  summary: Bucket;
  rows: Row[];
  people: Person[];
};

const METRIC_LABEL: Record<Metric, string> = {
  alc: "ALC",
  sectorIncharge: "Sector Incharge",
  total: "Total",
  punched: "Punched in",
  present: "Present",
  halfDay: "Half-day",
  absent: "In progress / Absent",
  leave: "Leave",
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function matchesMetric(person: Person, metric: Metric) {
  if (metric === "alc") return person.designation === "ALC";
  if (metric === "sectorIncharge") return person.designation === "Sector Incharge";
  if (metric === "total") return true;
  if (metric === "punched") return person.punched;
  if (metric === "present") return person.status === "present";
  if (metric === "halfDay") return person.status === "half_day";
  if (metric === "leave") return person.status === "leave";
  return person.status !== "present" && person.status !== "half_day" && person.status !== "leave";
}

function Stat({
  label,
  value,
  hint,
  className,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  className: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-5 py-4 text-left text-white shadow-card transition hover:brightness-110 ${active ? "ring-2 ring-white" : ""} ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/70">{hint}</p> : <p className="mt-1 text-xs text-white/70">Tap to view list</p>}
    </button>
  );
}

function Cell({
  value,
  active,
  className,
  onClick,
}: {
  value: number;
  active?: boolean;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-1 py-0.5 font-medium tabular-nums underline-offset-2 hover:underline ${active ? "bg-teal/10 font-semibold underline ring-1 ring-teal/30" : ""} ${className || ""}`}
    >
      {value}
    </button>
  );
}

export default function ClusterCoveragePage() {
  const [date, setDate] = useState(todayIst);
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState("");
  const [metric, setMetric] = useState<Metric | null>(null);
  const [clusterId, setClusterId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    setErr("");
    setMetric(null);
    setClusterId(null);
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
  const metricLabel = (m: Metric) => (m === "absent" ? absentLabel : METRIC_LABEL[m]);

  const people = data?.people || [];
  const detailPeople = useMemo(() => {
    if (!metric) return [];
    return people.filter((p) => {
      if (clusterId && p.clusterAdminId !== clusterId) return false;
      return matchesMetric(p, metric);
    });
  }, [people, metric, clusterId]);

  const detailTitle = useMemo(() => {
    if (!metric) return "";
    const row = data?.rows.find((r) => r.id === clusterId);
    const who = row ? row.name : "All cluster admins";
    return `${metricLabel(metric)} · ${who} · ${date}`;
  }, [metric, clusterId, data, date, absentLabel]);

  function openMetric(next: Metric, adminId?: string) {
    if (metric === next && clusterId === (adminId || null)) {
      setMetric(null);
      setClusterId(null);
      return;
    }
    setMetric(next);
    setClusterId(adminId || null);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  const summaryCards: PdfSummaryCard[] = [
    { label: "Cluster admins", value: data?.clusterAdmins || 0, background: "#0a1628" },
    { label: "ALC", value: summary?.alc || 0, background: "#12305A" },
    { label: "Sector Incharge", value: summary?.sectorIncharge || 0, background: "#1A56C4" },
    { label: "Punched in", value: summary?.punched || 0, background: "#c45c12" },
    { label: "Present", value: summary?.present || 0, background: "#047857" },
    { label: "Half-day", value: summary?.halfDay || 0, background: "#f59e0b" },
    { label: absentLabel, value: summary?.absent || 0, background: "#dc2626" },
    { label: "Leave", value: summary?.leave || 0, background: "#0284c7" },
  ];

  const tableHeaders = [
    "Cluster admin",
    "Zone",
    "District",
    "Assemblies",
    "ALC",
    "Sector Incharge",
    "Total",
    "Punched in",
    "Present",
    "Half-day",
    absentLabel,
    "Leave",
  ];

  const tableRows = (data?.rows || []).map((r) => [
    r.name,
    r.zone,
    r.district,
    r.assemblies.join(", "),
    r.alc,
    r.sectorIncharge,
    r.total,
    r.punched,
    r.present,
    r.halfDay,
    r.absent,
    r.leave,
  ]);

  function downloadSummaryCsv() {
    downloadCsv(`cluster-coverage-${date}`, tableHeaders, tableRows);
  }

  function downloadSummaryPdf() {
    downloadPdf(`Cluster coverage · ${date}`, tableHeaders, tableRows, {
      subtitle: `Counts follow your access${data?.accessLevel ? ` (${data.accessLevel})` : ""} · Left users excluded`,
      summaryCards,
      tableAccent: "#12305A",
      tableAccentText: "#ffffff",
    });
  }

  const personHeaders = [
    "Name",
    "Phone",
    "Designation",
    "Assembly",
    "Sector",
    "Zone",
    "District",
    "Cluster admin",
    "Punched in",
    "Status",
  ];

  function personRows(list: Person[]) {
    return list.map((p) => [
      p.name,
      p.phone,
      p.designation,
      p.assemblyName,
      p.sectorAllotted,
      p.zone,
      p.district,
      p.clusterAdminName,
      p.punched ? "Yes" : "No",
      p.statusLabel,
    ]);
  }

  function downloadPeopleCsv(list: Person[], name: string) {
    downloadCsv(name, personHeaders, personRows(list));
  }

  function downloadPeoplePdf(list: Person[], title: string) {
    downloadPdf(title, personHeaders, personRows(list), {
      subtitle: `${list.length} users · ${date}`,
      tableAccent: "#12305A",
      tableAccentText: "#ffffff",
    });
  }

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
          <h1 className="text-2xl font-semibold text-ink">Cluster coverage</h1>
          <p className="mt-1 max-w-3xl text-sm text-navy/55">
            Active ALC and Sector Incharge under each cluster admin. Tap a number to open the list. Counts follow your
            access{data?.accessLevel ? ` (${data.accessLevel})` : ""}. Left users are excluded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadSummaryCsv} disabled={!data?.rows.length} className="admin-btn-secondary disabled:opacity-40">
            Download CSV
          </button>
          <button type="button" onClick={downloadSummaryPdf} disabled={!data?.rows.length} className="admin-btn-ink disabled:opacity-40">
            Download PDF
          </button>
          <button
            type="button"
            onClick={() => downloadPeopleCsv(people, `cluster-coverage-users-${date}`)}
            disabled={!people.length}
            className="admin-btn-secondary disabled:opacity-40"
          >
            Download all users CSV
          </button>
        </div>
      </div>

      <label className="mb-5 block text-xs font-medium text-navy/55">
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
        <Stat className="bg-ink" label="Cluster admins" value={data?.clusterAdmins || 0} hint="In your access" />
        <Stat className="bg-[#12305A]" label="ALC" value={summary?.alc || 0} active={metric === "alc" && !clusterId} onClick={() => openMetric("alc")} />
        <Stat className="bg-teal" label="Sector Incharge" value={summary?.sectorIncharge || 0} active={metric === "sectorIncharge" && !clusterId} onClick={() => openMetric("sectorIncharge")} />
        <Stat className="bg-[#c45c12]" label="Punched in" value={summary?.punched || 0} active={metric === "punched" && !clusterId} onClick={() => openMetric("punched")} />
        <Stat className="bg-emerald-700" label="Present" value={summary?.present || 0} active={metric === "present" && !clusterId} onClick={() => openMetric("present")} />
        <Stat className="bg-amber-500" label="Half-day" value={summary?.halfDay || 0} active={metric === "halfDay" && !clusterId} onClick={() => openMetric("halfDay")} />
        <Stat className="bg-red-600" label={absentLabel} value={summary?.absent || 0} hint="Not Present, Half-day, or Leave" active={metric === "absent" && !clusterId} onClick={() => openMetric("absent")} />
        <Stat className="bg-sky-600" label="Leave" value={summary?.leave || 0} active={metric === "leave" && !clusterId} onClick={() => openMetric("leave")} />
      </div>

      <section className="admin-panel mt-6 !overflow-visible">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                {["Cluster admin", "Zone", "District", "Assemblies", "ALC", "Sector Incharge", "Total", "Punched in", "Present", "Half-day", absentLabel, "Leave"].map((label) => (
                  <th key={label} className="sticky top-0 z-20 bg-[#eef3fb] px-4 py-3 shadow-[0_1px_0_rgba(18,48,90,0.12)]">
                    {label}
                  </th>
                ))}
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
                  <td className="px-4 py-3 text-xs text-navy/70">{r.assemblies.length ? r.assemblies.join(", ") : "—"}</td>
                  {(
                    [
                      ["alc", r.alc, ""],
                      ["sectorIncharge", r.sectorIncharge, ""],
                      ["total", r.total, "font-semibold"],
                      ["punched", r.punched, "text-[#c45c12]"],
                      ["present", r.present, "text-emerald-700"],
                      ["halfDay", r.halfDay, "text-amber-700"],
                      ["absent", r.absent, "text-red-700"],
                      ["leave", r.leave, "text-sky-700"],
                    ] as [Metric, number, string][]
                  ).map(([key, value, className]) => (
                    <td key={key} className="px-4 py-3">
                      <Cell
                        value={value}
                        className={className}
                        active={metric === key && clusterId === r.id}
                        onClick={() => openMetric(key, r.id)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.rows.length ? <p className="p-6 text-sm text-navy/50">No cluster admins in your access.</p> : null}
        </div>
      </section>

      {metric ? (
        <section ref={detailRef} className="admin-panel mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy/5 bg-[#12305A] px-4 py-3 text-white">
            <div>
              <h2 className="font-semibold">{detailTitle}</h2>
              <p className="text-xs text-white/75">{detailPeople.length} users</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadPeopleCsv(detailPeople, `cluster-coverage-${metric}-${date}`)}
                disabled={!detailPeople.length}
                className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => downloadPeoplePdf(detailPeople, detailTitle)}
                disabled={!detailPeople.length}
                className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              >
                PDF
              </button>
              <button type="button" onClick={() => { setMetric(null); setClusterId(null); }} className="text-sm text-white/80 hover:text-white">
                Close
              </button>
            </div>
          </div>
          <div className="max-h-[480px] overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[11px] font-semibold uppercase tracking-wider text-navy/55">
                <tr>
                  {["User", "Designation", "Assembly / Sector", "Zone / District", "Cluster admin", "Punched in", "Status"].map((label) => (
                    <th key={label} className="sticky top-0 z-20 bg-[#eef3fb] px-4 py-2 shadow-[0_1px_0_rgba(18,48,90,0.12)]">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailPeople.map((p) => (
                  <tr key={p.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                    <td className="px-4 py-2">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-navy/50">{p.phone}</p>
                    </td>
                    <td className="px-4 py-2">{p.designation}</td>
                    <td className="px-4 py-2">
                      <p>{p.assemblyName}</p>
                      <p className="text-xs text-navy/50">{p.sectorAllotted || "—"}</p>
                    </td>
                    <td className="px-4 py-2">
                      <p>{p.zone || "—"}</p>
                      <p className="text-xs text-navy/50">{p.district || "—"}</p>
                    </td>
                    <td className="px-4 py-2">{p.clusterAdminName}</td>
                    <td className="px-4 py-2">{p.punched ? "Yes" : "No"}</td>
                    <td className="px-4 py-2">{p.statusLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!detailPeople.length ? <p className="p-6 text-sm text-navy/50">No users in this count.</p> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
