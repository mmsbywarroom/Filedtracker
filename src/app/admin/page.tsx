"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { cleanScope } from "@/lib/hierarchy";
import { downloadCsv, downloadPdf } from "@/lib/reportExport";

type Group = {
  name: string;
  users: number;
  active: number;
  inactive: number;
  faceRegistered: number;
  punched: number;
  live: number;
  leave: number;
  pendingPunchIn: number;
  pendingFace: number;
  pendingLive: number;
};

type Dash = {
  date: string;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  faceRegisteredUsers: number;
  activeToday: number;
  liveNow: number;
  leaveOnDate?: number;
  presentOnDate?: number;
  halfDayOnDate?: number;
  absentOnDate?: number;
  punches: number;
  pendingPunchIn: number;
  pendingFace: number;
  pendingLive: number;
  byDesignation: Group[];
  byZone: Group[];
  byDistrict: Group[];
  byAssembly: Group[];
  byCluster: Group[];
  byCallCenterSite?: Group[];
};

type DetailRow = {
  id: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  isActive: boolean;
  punchedToday: boolean;
  liveNow: boolean;
  punchInAt: string | null;
  faceRegistered?: boolean;
  faceRegisteredAt?: string | null;
  punchInAddress?: string | null;
  punchOutReason?: string | null;
  punchOutAddress?: string | null;
  onLeaveToday?: boolean;
  leaveRemark?: string | null;
  dayStatus?: string;
  dayStatusLabel?: string | null;
};

type Metric =
  | "total"
  | "active"
  | "inactive"
  | "face"
  | "live"
  | "punched"
  | "leave"
  | "present"
  | "halfDay"
  | "absent"
  | "pendingPunchIn"
  | "pendingFace"
  | "pendingLive";
type GroupBy = "designation" | "zone" | "district" | "assembly" | "callCenterSite";

const METRIC_LABELS: Record<Metric, string> = {
  total: "Total users",
  active: "Active users",
  inactive: "Inactive users",
  face: "Face registered",
  live: "Live now",
  punched: "Punched today",
  leave: "Leave",
  present: "Present",
  halfDay: "Half-day",
  absent: "Absent",
  pendingPunchIn: "Pending punch-in",
  pendingFace: "Pending face recog",
  pendingLive: "Pending live",
};

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  designation: "Designation",
  zone: "Zone",
  district: "District",
  assembly: "Assembly",
  callCenterSite: "Office",
};

function officeRows(sites: Group[] | undefined, name: string): Group[] {
  const found = sites?.find((r) => r.name === name);
  return [
    found || {
      name,
      users: 0,
      active: 0,
      inactive: 0,
      faceRegistered: 0,
      punched: 0,
      live: 0,
      leave: 0,
      pendingPunchIn: 0,
      pendingFace: 0,
      pendingLive: 0,
    },
  ];
}

function formatKolkata(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function buildDetailExport(
  metric: Metric,
  date: string,
  groupFilter: { groupBy: GroupBy; groupValue: string } | null,
  rows: DetailRow[],
  variant: "field" | "callCenter" = "field"
) {
  const titleParts = [METRIC_LABELS[metric], date];
  if (groupFilter) {
    titleParts.push(`${GROUP_BY_LABELS[groupFilter.groupBy]}: ${groupFilter.groupValue}`);
  }
  const title = titleParts.join(" · ");

  const filename = [
    variant === "callCenter" ? "call-center" : "dashboard",
    metric,
    date,
    groupFilter ? `${groupFilter.groupBy}-${groupFilter.groupValue}` : "all",
  ]
    .join("-")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  const headers = ["Name", "Phone", "Designation", "Assembly", "Sector", "Zone", "District"];
  if (metric === "face" || metric === "pendingFace") headers.push("Face registered");
  else if (metric === "leave") headers.push("Leave remark");
  else if (metric === "present" || metric === "halfDay" || metric === "absent") {
    headers.push("Punch in", "Day status");
  } else if (metric === "pendingPunchIn") {
    headers.push("Punch in");
  } else if (metric === "live" || metric === "punched" || metric === "pendingLive") {
    headers.push("Punch in");
    if (metric === "punched") headers.push("Remark");
    if (metric === "live" || metric === "pendingLive") headers.push("Status");
  }

  const data = rows.map((r) => {
    const row: (string | number | null | undefined)[] = [
      r.name,
      r.phone,
      r.designation,
      r.assemblyName,
      r.sectorAllotted,
      r.zone,
      r.district,
    ];
    if (metric === "face" || metric === "pendingFace") {
      row.push(r.faceRegisteredAt ? formatKolkata(r.faceRegisteredAt) : "Not registered");
    } else if (metric === "leave") {
      row.push(r.leaveRemark || "Marked leave on Attendance");
    } else if (metric === "present" || metric === "halfDay" || metric === "absent") {
      row.push(formatKolkata(r.punchInAt), r.dayStatusLabel || METRIC_LABELS[metric]);
    } else if (metric === "pendingPunchIn") {
      row.push(formatKolkata(r.punchInAt));
    } else if (metric === "live" || metric === "punched" || metric === "pendingLive") {
      row.push(formatKolkata(r.punchInAt));
      if (metric === "punched") {
        row.push(
          r.punchOutReason === "admin_present"
            ? [r.punchInAddress, r.punchOutAddress].filter(Boolean).join(" · ")
            : r.punchInAddress || "—"
        );
      }
      if (metric === "live") row.push("Live");
      else if (metric === "pendingLive") row.push("Punched out / not live");
    }
    return row;
  });

  return { title, filename, headers, data };
}

const METRIC_COLUMNS: { key: Metric; field: keyof Group; className?: string }[] = [
  { key: "total", field: "users" },
  { key: "inactive", field: "inactive", className: "text-navy/50" },
  { key: "face", field: "faceRegistered", className: "text-violet-700" },
  { key: "punched", field: "punched", className: "text-[#c45c12]" },
  { key: "live", field: "live", className: "text-emerald-600" },
  { key: "leave", field: "leave", className: "text-indigo-700" },
  { key: "pendingPunchIn", field: "pendingPunchIn", className: "text-amber-700" },
  { key: "pendingFace", field: "pendingFace", className: "text-rose-700" },
  { key: "pendingLive", field: "pendingLive", className: "text-sky-700" },
];

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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
  value: string | number;
  hint: string;
  className: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-5 py-4 text-left text-white shadow-card transition ring-offset-2 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-teal ${active ? "ring-2 ring-white" : ""} ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-white/75">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-white/70">{hint}</p>
    </button>
  );
}

function CellBtn({
  value,
  className,
  active,
  onClick,
}: {
  value: number;
  className?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-1 py-0.5 underline-offset-2 transition hover:underline focus:outline-none focus:ring-2 focus:ring-teal/40 ${active ? "bg-teal/10 font-semibold underline ring-1 ring-teal/30" : ""} ${className || ""}`}
    >
      {value}
    </button>
  );
}

function GroupTable({
  title,
  accent,
  rows,
  groupBy,
  activeMetric,
  activeGroup,
  onCellClick,
  hideName,
  date,
}: {
  title: string;
  accent: string;
  rows: Group[];
  groupBy: GroupBy;
  activeMetric: Metric | null;
  activeGroup: { groupBy: GroupBy; groupValue: string } | null;
  onCellClick: (metric: Metric, groupValue: string) => void;
  hideName?: boolean;
  date: string;
}) {
  function exportPdf() {
    const headers = [
      hideName ? null : "Name",
      "Users",
      "Inactive",
      "Face reg",
      "Punched",
      "Live",
      "Leave",
      "Pending punchin",
      "Pending face recog",
      "Pending live",
    ].filter(Boolean) as string[];
    const data = rows.map((r) => {
      const row: (string | number)[] = [];
      if (!hideName) row.push(r.name);
      row.push(
        r.users,
        r.inactive,
        r.faceRegistered,
        r.punched,
        r.live,
        r.leave || 0,
        r.pendingPunchIn,
        r.pendingFace,
        r.pendingLive
      );
      return row;
    });
    downloadPdf(`${title} · ${date}`, headers, data);
  }

  return (
    <section className="admin-panel overflow-hidden">
      <div className={`flex items-start justify-between gap-3 border-b border-navy/5 px-4 py-3 ${accent}`}>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs text-white/75">Tap any number to view users</p>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          disabled={!rows.length}
          className="shrink-0 rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40"
        >
          PDF
        </button>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
            <tr>
              {!hideName && <th className="px-4 py-2">Name</th>}
              <th className="px-4 py-2">Users</th>
              <th className="px-4 py-2">Inactive</th>
              <th className="px-4 py-2">Face reg</th>
              <th className="px-4 py-2">Punched</th>
              <th className="px-4 py-2">Live</th>
              <th className="px-4 py-2">Leave</th>
              <th className="px-4 py-2">Pending punchin</th>
              <th className="px-4 py-2">Pending face recog</th>
              <th className="px-4 py-2">Pending live</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={`border-t border-navy/5 ${i % 2 ? "bg-sand/40" : "bg-white"}`}>
                {!hideName && <td className="px-4 py-2 font-medium">{r.name}</td>}
                {METRIC_COLUMNS.map((col) => {
                  const val = Number(r[col.field] ?? 0);
                  const isActive =
                    activeMetric === col.key &&
                    activeGroup?.groupBy === groupBy &&
                    activeGroup.groupValue === r.name;
                  return (
                    <td key={col.key} className="px-4 py-2">
                      <CellBtn
                        value={val}
                        className={col.className}
                        active={isActive}
                        onClick={() => onCellClick(col.key, r.name)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-sm text-navy/50">No data for this filter.</p>}
      </div>
    </section>
  );
}

export function HierarchyDashboard({ variant = "field" }: { variant?: "field" | "callCenter" }) {
  const [date, setDate] = useState(todayIst);
  const [designation, setDesignation] = useState("");
  const [data, setData] = useState<Dash | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const [groupFilter, setGroupFilter] = useState<{ groupBy: GroupBy; groupValue: string } | null>(null);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [level, setLevel] = useState("State");
  const [isSuper, setIsSuper] = useState(false);
  const [visibleDens, setVisibleDens] = useState<string[]>([]);
  const [scope, setScope] = useState({
    zone: "",
    district: "",
    assemblyName: "",
    assemblies: [] as string[],
    cluster: "",
  });
  const detailRef = useRef<HTMLElement>(null);

  async function load(d: string, des: string) {
    const params = new URLSearchParams({ date: d, scope: variant === "callCenter" ? "callCenter" : "field" });
    if (des) params.set("designation", des);
    const res = await fetch(`/api/admin/dashboard?${params}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.error) {
      setData(null);
      return;
    }
    setData(json);
    const me = await fetch("/api/admin/me").then((r) => r.json());
    if (me.admin?.accessLevel) setLevel(me.admin.accessLevel);
    setIsSuper(Boolean(me.admin?.isSuper));
    if (Array.isArray(me.admin?.visibleDesignations)) {
      const dens = me.admin.visibleDesignations as string[];
      setVisibleDens(
        variant === "callCenter" ? dens.filter((d) => d === "Call Center") : dens.filter((d) => d !== "Call Center")
      );
    }
    const assemblies = Array.isArray(me.admin?.assemblies) ? me.admin.assemblies : [];
    setScope({
      zone: me.admin?.zone || "",
      district: me.admin?.district || "",
      assemblyName: me.admin?.assemblyName || "",
      assemblies,
      cluster: me.admin?.cluster || "",
    });
  }

  async function loadMetric(m: Metric, group?: { groupBy: GroupBy; groupValue: string }) {
    setMetric(m);
    setGroupFilter(group || null);
    setDetailLoading(true);
    const params = new URLSearchParams({
      date,
      metric: m,
      scope: variant === "callCenter" ? "callCenter" : "field",
    });
    if (designation) params.set("designation", designation);
    if (group) {
      params.set("groupBy", group.groupBy);
      params.set("groupValue", group.groupValue);
    }
    const res = await fetch(`/api/admin/dashboard?${params}`);
    setDetailLoading(false);
    if (!res.ok) {
      setDetailRows([]);
      return;
    }
    const json = await res.json();
    setDetailRows(json.rows || []);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  useEffect(() => {
    load(date, designation);
    setMetric(null);
    setGroupFilter(null);
    setDetailRows([]);
  }, [date, designation, variant]);

  const mappedAssemblies =
    scope.assemblies.length > 0
      ? scope.assemblies.map(cleanScope).filter(Boolean)
      : cleanScope(scope.assemblyName)
        ? cleanScope(scope.assemblyName).split(/[|;,]/).map((a) => cleanScope(a)).filter(Boolean)
        : [];

  const scopeText = isSuper
    ? "Full organisation"
    : level === "ALC" && !cleanScope(scope.assemblyName)
      ? "No assembly assigned — no users visible"
      : (level === "ZLC" || level === "Zone Coordinator") && !cleanScope(scope.zone) && !mappedAssemblies.length
        ? "No zone assigned — no users visible"
        : level === "DLC" && !cleanScope(scope.district) && !mappedAssemblies.length
          ? "No district assigned — no users visible"
          : level === "Cluster" && !mappedAssemblies.length && !cleanScope(scope.cluster)
            ? "No cluster / assemblies assigned — no users visible"
            : [
                "Users in scope",
                cleanScope(scope.zone),
                cleanScope(scope.district),
                cleanScope(scope.cluster),
                mappedAssemblies.length ? `${mappedAssemblies.length} assemblies` : cleanScope(scope.assemblyName),
              ]
                .filter(Boolean)
                .join(" · ");

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fff6d4] via-[#f3f6fb] to-[#e8eef8] px-4 py-6 md:px-8">
      <div className="mb-2 flex items-center gap-3">
        <BrandMark size={64} />
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-teal">
            {variant === "callCenter" ? "Call Center" : "Dashboard"}
          </p>
          <h1 className="text-2xl font-semibold">
            {variant === "callCenter" ? "Call Center overview" : "Hierarchy overview"}
          </h1>
        </div>
      </div>
      <p className="mt-1 text-sm text-navy/55">
        Login: <span className="rounded-full bg-teal px-2 py-0.5 text-xs font-semibold text-white">{level}</span>
        {" · "}
        {scopeText}
        {variant === "callCenter" ? " · Call Center users only" : ""}
      </p>

      <div className="mt-4 mb-5 flex flex-wrap gap-3">
        <label className="text-xs font-medium text-navy/55">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm"
          />
        </label>
        {variant !== "callCenter" && (
        <label className="text-xs font-medium text-navy/55">
          Designation
          <select
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">All designations</option>
            {visibleDens.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat
          className="bg-ink"
          label="Total users"
          value={data?.totalUsers || 0}
          hint="Tap to view list"
          active={metric === "total" && !groupFilter}
          onClick={() => loadMetric("total")}
        />
        <Stat
          className="bg-navy/70"
          label="Inactive"
          value={data?.inactiveUsers || 0}
          hint="Tap to view list"
          active={metric === "inactive" && !groupFilter}
          onClick={() => loadMetric("inactive")}
        />
        <Stat
          className="bg-violet-600"
          label="Face registered"
          value={data?.faceRegisteredUsers || 0}
          hint="Tap to view list"
          active={metric === "face" && !groupFilter}
          onClick={() => loadMetric("face")}
        />
        <Stat
          className="bg-emerald-600"
          label="Live now"
          value={data?.liveNow || 0}
          hint="Tap to view list"
          active={metric === "live" && !groupFilter}
          onClick={() => loadMetric("live")}
        />
        <Stat
          className="bg-[#c45c12]"
          label="Punched today"
          value={data?.activeToday || 0}
          hint="Tap to view list"
          active={metric === "punched" && !groupFilter}
          onClick={() => loadMetric("punched")}
        />
        <Stat
          className="bg-sky-600"
          label="Leave"
          value={data?.leaveOnDate || 0}
          hint="Marked leave (not counted in Live/Punched)"
          active={metric === "leave" && !groupFilter}
          onClick={() => loadMetric("leave")}
        />
        <Stat
          className="bg-emerald-700"
          label="Present"
          value={data?.presentOnDate || 0}
          hint="Punch by 10:30 · 6–12h on duty"
          active={metric === "present" && !groupFilter}
          onClick={() => loadMetric("present")}
        />
        <Stat
          className="bg-amber-500"
          label="Half-day"
          value={data?.halfDayOnDate || 0}
          hint="Punch after 10:30, by 1:00 PM"
          active={metric === "halfDay" && !groupFilter}
          onClick={() => loadMetric("halfDay")}
        />
        <Stat
          className="bg-red-600"
          label="Absent"
          value={data?.absentOnDate || 0}
          hint="No punch, after 1:00, or under 6h"
          active={metric === "absent" && !groupFilter}
          onClick={() => loadMetric("absent")}
        />
        <Stat
          className="bg-amber-600"
          label="Pending punchin"
          value={data?.pendingPunchIn || 0}
          hint="Active, not punched, not on leave"
          active={metric === "pendingPunchIn" && !groupFilter}
          onClick={() => loadMetric("pendingPunchIn")}
        />
        <Stat
          className="bg-rose-600"
          label="Pending face recog"
          value={data?.pendingFace || 0}
          hint="Active users, face pending"
          active={metric === "pendingFace" && !groupFilter}
          onClick={() => loadMetric("pendingFace")}
        />
        <Stat
          className="bg-sky-700"
          label="Pending live"
          value={data?.pendingLive || 0}
          hint="Punched today, not live now"
          active={metric === "pendingLive" && !groupFilter}
          onClick={() => loadMetric("pendingLive")}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {variant === "callCenter" ? (
          <>
            <GroupTable
              title="Yellow Stone"
              accent="bg-[#c9a227] text-white"
              rows={officeRows(data?.byCallCenterSite, "Yellow Stone")}
              groupBy="callCenterSite"
              hideName
              date={date}
              activeMetric={metric}
              activeGroup={groupFilter}
              onCellClick={(m) => loadMetric(m, { groupBy: "callCenterSite", groupValue: "Yellow Stone" })}
            />
            <GroupTable
              title="Unify"
              accent="bg-teal text-white"
              rows={officeRows(data?.byCallCenterSite, "Unify")}
              groupBy="callCenterSite"
              hideName
              date={date}
              activeMetric={metric}
              activeGroup={groupFilter}
              onCellClick={(m) => loadMetric(m, { groupBy: "callCenterSite", groupValue: "Unify" })}
            />
          </>
        ) : (
          <>
            <GroupTable
              title="Hierarchy · Designation wise"
              accent="bg-[#12305A] text-white"
              rows={data?.byDesignation || []}
              groupBy="designation"
              date={date}
              activeMetric={metric}
              activeGroup={groupFilter}
              onCellClick={(m, name) => loadMetric(m, { groupBy: "designation", groupValue: name })}
            />
            <GroupTable
              title="Zone wise"
              accent="bg-teal text-white"
              rows={data?.byZone || []}
              groupBy="zone"
              date={date}
              activeMetric={metric}
              activeGroup={groupFilter}
              onCellClick={(m, name) => loadMetric(m, { groupBy: "zone", groupValue: name })}
            />
            <GroupTable
              title="District wise"
              accent="bg-emerald-700 text-white"
              rows={data?.byDistrict || []}
              groupBy="district"
              date={date}
              activeMetric={metric}
              activeGroup={groupFilter}
              onCellClick={(m, name) => loadMetric(m, { groupBy: "district", groupValue: name })}
            />
            <GroupTable
              title="Assembly wise"
              accent="bg-[#1A56C4] text-white"
              rows={data?.byAssembly || []}
              groupBy="assembly"
              date={date}
              activeMetric={metric}
              activeGroup={groupFilter}
              onCellClick={(m, name) => loadMetric(m, { groupBy: "assembly", groupValue: name })}
            />
          </>
        )}
      </div>

      {metric && (
        <section ref={detailRef} id="dashboard-detail" className="mt-6 admin-panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-navy/5 bg-[#12305A] px-4 py-3 text-white">
            <h2 className="font-semibold">
              {METRIC_LABELS[metric]} · {date}
              {groupFilter && (
                <span className="font-normal text-white/85">
                  {" "}
                  · {GROUP_BY_LABELS[groupFilter.groupBy]}: {groupFilter.groupValue}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {!detailLoading && detailRows.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const { filename, headers, data } = buildDetailExport(
                        metric,
                        date,
                        groupFilter,
                        detailRows,
                        variant
                      );
                      downloadCsv(filename, headers, data);
                    }}
                    className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const { title, headers, data } = buildDetailExport(
                        metric,
                        date,
                        groupFilter,
                        detailRows,
                        variant
                      );
                      downloadPdf(title, headers, data);
                    }}
                    className="rounded-lg border border-white/30 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    PDF
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setMetric(null);
                  setGroupFilter(null);
                }}
                className="text-sm text-white/80 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {detailLoading ? (
              <p className="p-6 text-sm text-navy/50">Loading…</p>
            ) : (
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
                  <tr>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Designation</th>
                    <th className="px-4 py-2">Assembly / Sector</th>
                    <th className="px-4 py-2">Zone</th>
                    {metric === "face" || metric === "pendingFace" ? <th className="px-4 py-2">Face registered</th> : null}
                    {metric === "leave" && <th className="px-4 py-2">Leave remark</th>}
                    {(metric === "live" ||
                      metric === "punched" ||
                      metric === "pendingPunchIn" ||
                      metric === "pendingLive" ||
                      metric === "present" ||
                      metric === "halfDay" ||
                      metric === "absent") && <th className="px-4 py-2">Punch in</th>}
                    {(metric === "present" || metric === "halfDay" || metric === "absent") && (
                      <th className="px-4 py-2">Day status</th>
                    )}
                    {metric === "punched" && <th className="px-4 py-2">Remark</th>}
                    {(metric === "live" || metric === "pendingLive") && <th className="px-4 py-2">Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((r) => (
                    <tr key={r.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                      <td className="px-4 py-2">
                        <p className="font-semibold">{r.name}</p>
                        <p className="text-xs text-navy/50">{r.phone}</p>
                      </td>
                      <td className="px-4 py-2">{r.designation}</td>
                      <td className="px-4 py-2">
                        <p>{r.assemblyName}</p>
                        <p className="text-xs text-navy/50">{r.sectorAllotted}</p>
                      </td>
                      <td className="px-4 py-2">{r.zone}</td>
                      {(metric === "face" || metric === "pendingFace") && (
                        <td className="px-4 py-2 text-xs">
                          {r.faceRegisteredAt
                            ? new Date(r.faceRegisteredAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                            : "Not registered"}
                        </td>
                      )}
                      {metric === "leave" && (
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                            On leave today
                          </span>
                          <p className="mt-1 text-xs text-navy/55">{r.leaveRemark || "Marked leave on Attendance"}</p>
                        </td>
                      )}
                      {(metric === "live" ||
                        metric === "punched" ||
                        metric === "pendingPunchIn" ||
                        metric === "pendingLive" ||
                        metric === "present" ||
                        metric === "halfDay" ||
                        metric === "absent") && (
                        <td className="px-4 py-2 text-xs">
                          {r.punchInAt
                            ? new Date(r.punchInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                            : "—"}
                        </td>
                      )}
                      {(metric === "present" || metric === "halfDay" || metric === "absent") && (
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              r.dayStatus === "present"
                                ? "bg-emerald-50 text-emerald-700"
                                : r.dayStatus === "half_day"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            {r.dayStatusLabel || METRIC_LABELS[metric]}
                          </span>
                        </td>
                      )}
                      {metric === "punched" && (
                        <td className="px-4 py-2 text-xs text-navy/70">
                          {r.punchOutReason === "admin_present" ? (
                            <div>
                              <p className="font-medium text-teal">{r.punchInAddress || "Manual present by admin"}</p>
                              {r.punchOutAddress ? <p className="mt-0.5">{r.punchOutAddress}</p> : null}
                            </div>
                          ) : (
                            r.punchInAddress || "—"
                          )}
                        </td>
                      )}
                      {metric === "live" && (
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Live
                          </span>
                        </td>
                      )}
                      {metric === "pendingLive" && (
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                            Punched out / not live
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!detailLoading && !detailRows.length && (
              <p className="p-6 text-sm text-navy/50">No users for this filter.</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

export default function AdminDashboardPage() {
  return <HierarchyDashboard variant="field" />;
}
