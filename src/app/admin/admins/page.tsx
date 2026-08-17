"use client";

import { FormEvent, useEffect, useState } from "react";
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

const LEVELS = ["State", "ZLC", "DLC", "Cluster", "ALC"] as const;

export default function AdminsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
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
  }

  useEffect(() => {
    load();
  }, []);

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
      <p className="mt-1 text-sm text-navy/55">
        Admin ID + password do, phir designation access choose karo. State poora dekhega; ZLC ko DLC aur neeche; DLC ko Cluster aur neeche.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form onSubmit={create} className="rounded-[1.75rem] bg-white p-5 shadow-card">
          <h2 className="font-semibold">Create admin</h2>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm" />
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Admin ID
            <input required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="zlc.pathankot" className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm" />
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Password
            <input required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm" />
          </label>
          <label className="mt-3 block text-xs font-medium text-navy/60">
            Admin level
            <select value={form.accessLevel} onChange={(e) => setLevel(e.target.value)} className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm">
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
                <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm" />
              </label>
              {(form.accessLevel === "DLC" || form.accessLevel === "Cluster" || form.accessLevel === "ALC") && (
                <label className="block text-xs font-medium text-navy/60">
                  District
                  <input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm" />
                </label>
              )}
              {(form.accessLevel === "Cluster" || form.accessLevel === "ALC") && (
                <label className="block text-xs font-medium text-navy/60">
                  Cluster
                  <input value={form.cluster} onChange={(e) => setForm({ ...form, cluster: e.target.value })} className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm" />
                </label>
              )}
              {form.accessLevel === "ALC" && (
                <label className="block text-xs font-medium text-navy/60">
                  Assembly
                  <input value={form.assemblyName} onChange={(e) => setForm({ ...form, assemblyName: e.target.value })} className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm" />
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
                    </p>
                    <p className="mt-1 text-xs text-navy/50">{a.designations.join(", ") || "Default below-level"}</p>
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
