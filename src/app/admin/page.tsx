"use client";

import { useEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { DESIGNATIONS, cleanScope } from "@/lib/hierarchy";
import { formatKm } from "@/lib/utils";

type Group = {
  name: string;
  users: number;
  active: number;
  inactive: number;
  punched: number;
  live: number;
  distance: number;
};

type Dash = {
  date: string;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  activeToday: number;
  liveNow: number;
  punches: number;
  totalDistance: number;
  byDesignation: Group[];
  byZone: Group[];
  byDistrict: Group[];
  byAssembly: Group[];
  byCluster: Group[];
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
  distanceLabel: string;
  punchInAt: string | null;
};

type Metric = "total" | "active" | "inactive" | "live" | "punched" | "distance";
type GroupBy = "designation" | "zone" | "district" | "assembly";

const METRIC_LABELS: Record<Metric, string> = {
  total: "Total users",
  active: "Active users",
  inactive: "Inactive users",
  live: "Live now",
  punched: "Punched today",
  distance: "Travel today",
};

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  designation: "Designation",
  zone: "Zone",
  district: "District",
  assembly: "Assembly",
};

const METRIC_COLUMNS: { key: Metric; field: keyof Group; className?: string }[] = [
  { key: "total", field: "users" },
  { key: "active", field: "active", className: "text-teal" },
  { key: "inactive", field: "inactive", className: "text-navy/50" },
  { key: "punched", field: "punched", className: "text-[#c45c12]" },
  { key: "live", field: "live", className: "text-emerald-600" },
  { key: "distance", field: "distance", className: "font-semibold text-ink" },
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
  format,
}: {
  value: number;
  className?: string;
  active?: boolean;
  onClick: () => void;
  format?: (n: number) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-1 py-0.5 underline-offset-2 transition hover:underline focus:outline-none focus:ring-2 focus:ring-teal/40 ${active ? "bg-teal/10 font-semibold underline ring-1 ring-teal/30" : ""} ${className || ""}`}
    >
      {format ? format(value) : value}
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
}: {
  title: string;
  accent: string;
  rows: Group[];
  groupBy: GroupBy;
  activeMetric: Metric | null;
  activeGroup: { groupBy: GroupBy; groupValue: string } | null;
  onCellClick: (metric: Metric, groupValue: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
      <div className={`border-b border-navy/5 px-4 py-3 ${accent}`}>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-white/75">Tap any number to view users</p>
      </div>
      <div className="max-h-[360px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Users</th>
              <th className="px-4 py-2">Active</th>
              <th className="px-4 py-2">Inactive</th>
              <th className="px-4 py-2">Punched</th>
              <th className="px-4 py-2">Live</th>
              <th className="px-4 py-2">Distance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className={`border-t border-navy/5 ${i % 2 ? "bg-sand/40" : "bg-white"}`}>
                <td className="px-4 py-2 font-medium">{r.name}</td>
                {METRIC_COLUMNS.map((col) => {
                  const val = r[col.field] as number;
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
                        format={col.key === "distance" ? formatKm : undefined}
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

export default function AdminDashboardPage() {
  const [date, setDate] = useState(todayIst);
  const [designation, setDesignation] = useState("");
  const [data, setData] = useState<Dash | null>(null);
  const [metric, setMetric] = useState<Metric | null>(null);
  const [groupFilter, setGroupFilter] = useState<{ groupBy: GroupBy; groupValue: string } | null>(null);
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [level, setLevel] = useState("State");
  const [isSuper, setIsSuper] = useState(false);
  const [scope, setScope] = useState({
    zone: "",
    district: "",
    assemblyName: "",
    assemblies: [] as string[],
    cluster: "",
  });
  const detailRef = useRef<HTMLElement>(null);

  async function load(d: string, des: string) {
    const params = new URLSearchParams({ date: d });
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
    const params = new URLSearchParams({ date, metric: m });
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
  }, [date, designation]);

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
      : (level === "ZLC" || level === "Zone Coordinator") && !cleanScope(scope.zone)
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
          <p className="text-xs uppercase tracking-[0.2em] text-teal">Dashboard</p>
          <h1 className="text-2xl font-semibold">Hierarchy overview</h1>
        </div>
      </div>
      <p className="mt-1 text-sm text-navy/55">
        Login: <span className="rounded-full bg-teal px-2 py-0.5 text-xs font-semibold text-white">{level}</span>
        {" · "}
        {scopeText}
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
        <label className="text-xs font-medium text-navy/55">
          Designation
          <select
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            className="mt-1 block rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm"
          >
            <option value="">All designations</option>
            {DESIGNATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
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
          className="bg-teal"
          label="Active"
          value={data?.activeUsers || 0}
          hint="Tap to view list"
          active={metric === "active" && !groupFilter}
          onClick={() => loadMetric("active")}
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
          className="bg-[#0f766e]"
          label="Distance"
          value={formatKm(data?.totalDistance || 0)}
          hint="Tap to view list"
          active={metric === "distance" && !groupFilter}
          onClick={() => loadMetric("distance")}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <GroupTable
          title="Hierarchy · Designation wise"
          accent="bg-[#12305A] text-white"
          rows={data?.byDesignation || []}
          groupBy="designation"
          activeMetric={metric}
          activeGroup={groupFilter}
          onCellClick={(m, name) => loadMetric(m, { groupBy: "designation", groupValue: name })}
        />
        <GroupTable
          title="Zone wise"
          accent="bg-teal text-white"
          rows={data?.byZone || []}
          groupBy="zone"
          activeMetric={metric}
          activeGroup={groupFilter}
          onCellClick={(m, name) => loadMetric(m, { groupBy: "zone", groupValue: name })}
        />
        <GroupTable
          title="District wise"
          accent="bg-emerald-700 text-white"
          rows={data?.byDistrict || []}
          groupBy="district"
          activeMetric={metric}
          activeGroup={groupFilter}
          onCellClick={(m, name) => loadMetric(m, { groupBy: "district", groupValue: name })}
        />
        <GroupTable
          title="Assembly wise"
          accent="bg-[#1A56C4] text-white"
          rows={data?.byAssembly || []}
          groupBy="assembly"
          activeMetric={metric}
          activeGroup={groupFilter}
          onCellClick={(m, name) => loadMetric(m, { groupBy: "assembly", groupValue: name })}
        />
      </div>

      {metric && (
        <section ref={detailRef} id="dashboard-detail" className="mt-6 overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
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
                    {metric === "distance" && <th className="px-4 py-2">Distance</th>}
                    {(metric === "live" || metric === "punched") && <th className="px-4 py-2">Punch in</th>}
                    {metric === "live" && <th className="px-4 py-2">Status</th>}
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
                      {metric === "distance" && <td className="px-4 py-2 font-semibold">{r.distanceLabel}</td>}
                      {(metric === "live" || metric === "punched") && (
                        <td className="px-4 py-2 text-xs">
                          {r.punchInAt
                            ? new Date(r.punchInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                            : "—"}
                        </td>
                      )}
                      {metric === "live" && (
                        <td className="px-4 py-2">
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            Live
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
