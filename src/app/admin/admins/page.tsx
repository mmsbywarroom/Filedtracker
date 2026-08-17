"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DESIGNATIONS, defaultVisibleDesignations } from "@/lib/hierarchy";

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
  cluster: string;
};

type Place = { zone: string; district: string; assemblyName: string; cluster: string };

const LEVELS = ["State", "ZLC", "DLC", "Cluster", "ALC"] as const;
const field = "mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm";

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    accessLevel: "ZLC",
    designations: defaultVisibleDesignations("ZLC"),
    zone: "",
    district: "",
    assemblyName: "",
    cluster: "",
  });

  async function load() {
    const res = await fetch("/api/admin/admins");
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    if (res.status === 403) {
      setError("Only State admin can create other admins.");
      return;
    }
    const data = await res.json();
    setAdmins(data.admins || []);
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

  function setLevel(accessLevel: string) {
    setForm({ ...form, accessLevel, designations: defaultVisibleDesignations(accessLevel) });
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
      accessLevel: "ZLC",
      designations: defaultVisibleDesignations("ZLC"),
      zone: "",
      district: "",
      assemblyName: "",
      cluster: "",
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this admin login?")) return;
    await fetch(`/api/admin/admins/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Access</p>
      <h1 className="text-2xl font-semibold">Admin users</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy/60">
        Create an admin login. State sees the full organisation. ZLC sees one zone, DLC one district, Cluster one cluster, and ALC one assembly.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form onSubmit={create} className="rounded-[1.75rem] bg-white p-5 shadow-card">
          <h2 className="font-semibold">Create admin</h2>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Gurpreet Singh" className={field} />
            <span className="mt-1 block text-[11px] font-normal text-navy/45">Display name shown in the admin list.</span>
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Admin ID
            <input required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="zlc.majha" className={field} />
            <span className="mt-1 block text-[11px] font-normal text-navy/45">Used as the username on the admin login page.</span>
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Password
            <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={field} />
            <span className="mt-1 block text-[11px] font-normal text-navy/45">Password for this login. At least 6 characters.</span>
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Admin level
            <select value={form.accessLevel} onChange={(e) => setLevel(e.target.value)} className={field}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-navy/45">
              {form.accessLevel === "State" && "State sees all zones and users."}
              {form.accessLevel === "ZLC" && "ZLC sees only the selected zone and levels below it."}
              {form.accessLevel === "DLC" && "DLC sees only the selected district and levels below it."}
              {form.accessLevel === "Cluster" && "Cluster sees only that cluster’s ALCs and Sector Incharges."}
              {form.accessLevel === "ALC" && "ALC sees only Sector Incharges in the selected assembly."}
            </span>
          </label>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-navy/45">Can see these designations</p>
          <p className="mt-1 text-[11px] text-navy/45">Tick the designations this admin can see. Example: Sector Incharge only hides DLC/ALC users.</p>
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
                  onChange={(e) => setForm({ ...form, zone: e.target.value, district: "", cluster: "", assemblyName: "" })}
                  className={field}
                >
                  <option value="">Select zone</option>
                  {zones.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-normal text-navy/45">Which zone this admin can see, such as Majha or Malwa.</span>
              </label>
              {(form.accessLevel === "DLC" || form.accessLevel === "Cluster" || form.accessLevel === "ALC") && (
                <label className="block text-xs font-medium text-navy/60">
                  District
                  <select
                    required
                    value={form.district}
                    onChange={(e) => setForm({ ...form, district: e.target.value, cluster: "", assemblyName: "" })}
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
                  <select required value={form.assemblyName} onChange={(e) => setForm({ ...form, assemblyName: e.target.value })} className={field}>
                    <option value="">Select assembly</option>
                    {assemblies.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <button className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white">Create admin</button>
        </form>

        <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-card">
          <div className="border-b border-navy/5 px-4 py-3 font-semibold">Existing admins</div>
          <div className="max-h-[70vh] overflow-auto">
            {admins.map((a) => (
              <div key={a.id} className="border-t border-navy/5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{a.name || a.email}</p>
                    <p className="text-xs text-navy/50">{a.email}</p>
                    <p className="mt-1 text-sm text-navy/70">
                      {a.accessLevel}
                      {a.isSuper ? " · Super" : ""}
                      {a.zone ? ` · ${a.zone}` : ""}
                      {a.district ? ` · ${a.district}` : ""}
                      {a.cluster ? ` · ${a.cluster}` : ""}
                      {a.assemblyName ? ` · ${a.assemblyName}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-navy/50">{a.designations.join(", ") || "Default: levels below this admin"}</p>
                  </div>
                  {!a.isSuper && (
                    <button onClick={() => remove(a.id)} className="text-xs font-semibold text-red-600">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!admins.length && !error && <p className="p-6 text-sm text-navy/50">No extra admins yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
