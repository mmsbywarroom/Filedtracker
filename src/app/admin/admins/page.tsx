"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";
import { ADMIN_LEVELS, DESIGNATIONS, defaultVisibleDesignations } from "@/lib/hierarchy";

type AdminRow = {
  id: string;
  email: string;
  name: string;
  accessLevel: string;
  isSuper: boolean;
  designations: string[];
  zone: string;
  district: string;
  assemblyName: string;
  assemblies?: string[];
  cluster: string;
};

type Place = { zone: string; district: string; assemblyName: string; cluster: string };

const LEVELS = ADMIN_LEVELS;
const field = "mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm";
const selectClass = "h-11 rounded-xl border border-navy/10 bg-white px-3 text-sm outline-none focus:border-teal";

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState("");
  const [csvMsg, setCsvMsg] = useState("");
  const [q, setQ] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [designationFilter, setDesignationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    accessLevel: "Zone Coordinator",
    designations: defaultVisibleDesignations("Zone Coordinator"),
    zone: "",
    district: "",
    assemblyName: "",
    assemblies: [] as string[],
    cluster: "",
  });

  async function load() {
    const res = await fetch("/api/admin/admins");
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    if (res.status === 403) {
      setError("Only super admin can create other admins.");
      return;
    }
    const data = await res.json();
    setAdmins(data.admins || []);
    setSelected({});
    const look = await fetch("/api/admin/lookups").then((r) => r.json());
    setPlaces(look.places || []);
  }

  useEffect(() => {
    load();
  }, []);

  const zones = useMemo(() => Array.from(new Set(places.map((p) => p.zone).filter(Boolean))).sort(), [places]);
  const districts = useMemo(
    () =>
      Array.from(
        new Set(places.filter((p) => !form.zone || p.zone === form.zone).map((p) => p.district).filter(Boolean))
      ).sort(),
    [places, form.zone]
  );
  const clusters = useMemo(
    () =>
      Array.from(
        new Set(
          places
            .filter((p) => (!form.zone || p.zone === form.zone) && (!form.district || p.district === form.district))
            .map((p) => p.cluster)
            .filter(Boolean)
        )
      ).sort(),
    [places, form.zone, form.district]
  );
  const assemblies = useMemo(
    () =>
      Array.from(
        new Set(
          places
            .filter((p) => (!form.zone || p.zone === form.zone) && (!form.district || p.district === form.district))
            .map((p) => p.assemblyName)
            .filter(Boolean)
        )
      ).sort(),
    [places, form.zone, form.district]
  );

  const filtered = useMemo(() => {
    return admins.filter((a) => {
      const text = [a.name, a.email, a.accessLevel, a.zone, a.district, a.cluster, a.assemblyName, ...(a.designations || [])]
        .join(" ")
        .toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (levelFilter && a.accessLevel !== levelFilter) return false;
      if (designationFilter && !(a.designations || []).includes(designationFilter)) return false;
      return true;
    });
  }, [admins, q, levelFilter, designationFilter]);

  useEffect(() => {
    setPage(1);
  }, [q, levelFilter, designationFilter, pageSize]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const deletablePage = useMemo(() => pageRows.filter((a) => !a.isSuper), [pageRows]);
  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);
  const pageAllSelected = deletablePage.length > 0 && deletablePage.every((a) => selected[a.id]);

  function toggleOne(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function togglePage() {
    setSelected((s) => {
      const next = { ...s };
      const turnOn = !pageAllSelected;
      for (const a of deletablePage) next[a.id] = turnOn;
      return next;
    });
  }

  function selectFiltered() {
    setSelected((s) => {
      const next = { ...s };
      for (const a of filtered) {
        if (!a.isSuper) next[a.id] = true;
      }
      return next;
    });
  }

  function setLevel(accessLevel: string) {
    setForm({
      ...form,
      accessLevel,
      designations: defaultVisibleDesignations(accessLevel),
      assemblies: [],
      assemblyName: "",
    });
  }

  function toggleAssembly(name: string) {
    setForm((f) => {
      const has = f.assemblies.includes(name);
      return {
        ...f,
        assemblies: has ? f.assemblies.filter((x) => x !== name) : [...f.assemblies, name],
      };
    });
  }

  function toggleDes(d: string) {
    const has = form.designations.includes(d);
    setForm({
      ...form,
      designations: has ? form.designations.filter((x) => x !== d) : [...form.designations, d],
    });
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.accessLevel !== "State" && !form.zone) {
      setError("Select a zone.");
      return;
    }
    if ((form.accessLevel === "DLC" || form.accessLevel === "Cluster" || form.accessLevel === "ALC") && !form.district) {
      setError("Select a district.");
      return;
    }
    if (form.accessLevel === "Cluster" && !form.cluster) {
      setError("Select a cluster.");
      return;
    }
    if ((form.accessLevel === "DLC" || form.accessLevel === "Cluster") && !form.assemblies.length) {
      setError("Select at least one assembly for this DLC / Cluster.");
      return;
    }
    if (form.accessLevel === "ALC" && !form.assemblyName) {
      setError("Select an assembly. ALC can only see users in that assembly.");
      return;
    }
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not create admin.");
      return;
    }
    setForm({
      name: "",
      email: "",
      password: "",
      accessLevel: "Zone Coordinator",
      designations: defaultVisibleDesignations("Zone Coordinator"),
      zone: "",
      district: "",
      assemblyName: "",
      assemblies: [],
      cluster: "",
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this admin login?")) return;
    await fetch(`/api/admin/admins/${id}`, { method: "DELETE" });
    load();
  }

  async function bulkDelete() {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected admin login(s)?`)) return;
    setBulkBusy(true);
    const res = await fetch("/api/admin/admins", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    setBulkBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCsvMsg(data.error || "Bulk delete failed");
      return;
    }
    setCsvMsg(`Deleted ${data.deleted || 0} admin(s).`);
    load();
  }

  async function uploadCsv(file: File) {
    setCsvMsg("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/admins/csv", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setCsvMsg(data.error || "CSV upload failed");
      return;
    }
    setCsvMsg(
      `Created ${data.created}, skipped ${data.skipped}${data.errors?.length ? `, ${data.errors.length} row errors` : ""}`
    );
    load();
  }

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-teal">Access</p>
          <h1 className="text-2xl font-semibold">Admin users</h1>
          <p className="mt-1 max-w-3xl text-sm text-navy/60">
            Create admins one by one or bulk upload CSV. For DLC / Cluster, map multiple assemblies — they will only see
            ALC and Sector Incharge users in those assemblies.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/sample-admins.csv"
            download
            className="rounded-xl border border-navy/10 bg-white px-4 py-2.5 text-sm font-semibold text-navy/80 shadow-card"
          >
            Download CSV template
          </a>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-teal/30 bg-teal/10 px-4 py-2.5 text-sm font-semibold text-teal shadow-card"
          >
            Bulk upload CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadCsv(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {csvMsg && <p className="mb-4 rounded-xl bg-white px-4 py-2 text-sm text-navy/70 shadow-card">{csvMsg}</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <form onSubmit={create} className="rounded-[1.75rem] bg-white p-5 shadow-card">
          <h2 className="font-semibold">Create admin</h2>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Gurpreet Singh"
              className={field}
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Admin ID
            <input
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="zlc.majha"
              className={field}
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Password
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={field}
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Admin level
            <select value={form.accessLevel} onChange={(e) => setLevel(e.target.value)} className={field}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-navy/45">Can see these designations</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DESIGNATIONS.map((d) => (
              <label key={d} className="flex items-center gap-2 rounded-xl border border-navy/10 px-3 py-2 text-sm">
                <input type="checkbox" checked={form.designations.includes(d)} onChange={() => toggleDes(d)} />
                {d}
              </label>
            ))}
          </div>

          {form.accessLevel !== "State" && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-navy/60">
                Zone
                <select
                  required
                  value={form.zone}
                  onChange={(e) =>
                    setForm({ ...form, zone: e.target.value, district: "", cluster: "", assemblyName: "", assemblies: [] })
                  }
                  className={field}
                >
                  <option value="">Select zone</option>
                  {zones.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </label>
              {(form.accessLevel === "DLC" || form.accessLevel === "Cluster" || form.accessLevel === "ALC") && (
                <label className="block text-xs font-medium text-navy/60">
                  District
                  <select
                    required
                    value={form.district}
                    onChange={(e) =>
                      setForm({ ...form, district: e.target.value, cluster: "", assemblyName: "", assemblies: [] })
                    }
                    className={field}
                  >
                    <option value="">Select district</option>
                    {districts.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
              )}
              {(form.accessLevel === "Cluster" || form.accessLevel === "ALC") && (
                <label className="block text-xs font-medium text-navy/60">
                  Cluster
                  <select
                    required={form.accessLevel === "Cluster"}
                    value={form.cluster}
                    onChange={(e) => setForm({ ...form, cluster: e.target.value })}
                    className={field}
                  >
                    <option value="">Select cluster</option>
                    {clusters.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
              {form.accessLevel === "ALC" && (
                <label className="block text-xs font-medium text-navy/60">
                  Assembly
                  <select
                    required
                    value={form.assemblyName}
                    onChange={(e) => setForm({ ...form, assemblyName: e.target.value })}
                    className={field}
                  >
                    <option value="">Select assembly</option>
                    {assemblies.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {(form.accessLevel === "DLC" || form.accessLevel === "Cluster") && form.district && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-navy/45">
                Mapped assemblies ({form.assemblies.length} selected)
              </p>
              <p className="mt-1 text-xs text-navy/50">
                Tick every assembly under this {form.accessLevel}. Users list will show ALC + Sector Incharge in these
                assemblies only.
              </p>
              <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-navy/10 bg-sand/30 p-2">
                {assemblies.length ? (
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {assemblies.map((a) => (
                      <label key={a} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/80">
                        <input
                          type="checkbox"
                          checked={form.assemblies.includes(a)}
                          onChange={() => toggleAssembly(a)}
                        />
                        <span className="truncate">{a}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-3 text-xs text-navy/45">No assemblies found for this district yet. Create users first.</p>
                )}
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white">Create admin</button>
        </form>

        <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-card">
          <div className="border-b border-navy/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Existing admins</h2>
              <p className="text-xs text-navy/50">
                {filtered.length} of {admins.length}
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or admin ID"
                className={selectClass}
              />
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={selectClass}>
                <option value="">All levels</option>
                {LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <select
                value={designationFilter}
                onChange={(e) => setDesignationFilter(e.target.value)}
                className={selectClass}
              >
                <option value="">All designations</option>
                {DESIGNATIONS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedCount > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-red-100 bg-red-50/80 px-4 py-3">
              <p className="text-sm font-medium text-red-800">{selectedCount} selected</p>
              <button
                type="button"
                onClick={selectFiltered}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-navy/70 shadow-sm"
              >
                Select all filtered
              </button>
              <button
                type="button"
                onClick={() => setSelected({})}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-navy/70 shadow-sm"
              >
                Clear
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={bulkDelete}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {bulkBusy ? "Deleting…" : `Delete selected (${selectedCount})`}
              </button>
            </div>
          )}

          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={pageAllSelected}
                      onChange={togglePage}
                      aria-label="Select page"
                      className="h-4 w-4 rounded border-navy/20"
                    />
                  </th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Level</th>
                  <th className="px-4 py-3">Designations</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => (
                  <tr key={a.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                    <td className="px-3 py-3">
                      {!a.isSuper ? (
                        <input
                          type="checkbox"
                          checked={Boolean(selected[a.id])}
                          onChange={() => toggleOne(a.id)}
                          aria-label={`Select ${a.name || a.email}`}
                          className="h-4 w-4 rounded border-navy/20"
                        />
                      ) : (
                        <span className="inline-block w-4" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink">{a.name || a.email}</p>
                      <p className="text-xs text-navy/50">{a.email}</p>
                      {a.isSuper && (
                        <span className="mt-1 inline-flex rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal">
                          Super
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{a.accessLevel}</td>
                    <td className="px-4 py-3 text-xs text-navy/70">
                      {(a.designations || []).join(", ") || "Default below level"}
                    </td>
                    <td className="px-4 py-3 text-xs text-navy/70">
                      {[a.zone, a.district, a.cluster].filter(Boolean).join(" · ") || "Full organisation"}
                      {(a.assemblies?.length || a.assemblyName) && (
                        <p className="mt-1 text-[11px] text-navy/50">
                          Assemblies:{" "}
                          {(a.assemblies?.length ? a.assemblies : a.assemblyName.split(/[|;,]/)).filter(Boolean).join(", ") ||
                            "—"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!a.isSuper && (
                        <button onClick={() => remove(a.id)} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filtered.length && !error && <p className="p-6 text-sm text-navy/50">No matching admins.</p>}
          </div>
          {!!filtered.length && (
            <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={setPageSize} />
          )}
        </section>
      </div>
    </main>
  );
}
