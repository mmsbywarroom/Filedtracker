"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type UserRow = {
  id: string;
  name: string;
  phone: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  isActive: boolean;
  faceRegistered: boolean;
  lastPunchIn: string | null;
  lastPunchOut: string | null;
};

const empty = {
  name: "",
  phone: "",
  assemblyName: "",
  sectorAllotted: "",
  zone: "",
  district: "",
};

export default function AdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [csvMsg, setCsvMsg] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setUsers(data.users || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const url = editing ? `/api/admin/users/${editing}` : "/api/admin/users";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Save failed");
      return;
    }
    setForm(empty);
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this user and all footprints?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function uploadCsv(file: File) {
    setCsvMsg("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/users/csv", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setCsvMsg(data.error || "CSV failed");
      return;
    }
    setCsvMsg(`Created ${data.created}, updated ${data.updated}${data.errors?.length ? `, ${data.errors.length} row errors` : ""}`);
    load();
  }

  const filtered = users.filter((u) =>
    [u.name, u.phone, u.assemblyName, u.sectorAllotted, u.zone, u.district].join(" ").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-sand">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-teal">Admin</p>
            <h1 className="text-2xl font-semibold">Sector incharges</h1>
          </div>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/admin/login";
            }}
            className="text-sm text-navy/50"
          >
            Logout
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <aside className="space-y-4">
            <form onSubmit={save} className="rounded-[1.75rem] bg-white p-5 shadow-card">
              <h2 className="font-semibold">{editing ? "Edit user" : "Create user"}</h2>
              {(
                [
                  ["name", "Sector Incharge Name"],
                  ["phone", "Sector Incharge Number"],
                  ["assemblyName", "Assembly Name"],
                  ["sectorAllotted", "Sector Allotted"],
                  ["zone", "Zone"],
                  ["district", "District"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="mt-3 block text-xs font-medium text-navy/60">
                  {label}
                  <input
                    value={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm"
                    required
                  />
                </label>
              ))}
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
              <button className="mt-4 w-full rounded-xl bg-ink py-2.5 text-sm font-semibold text-white">
                {editing ? "Update" : "Create"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="mt-2 w-full text-sm text-navy/50"
                  onClick={() => {
                    setEditing(null);
                    setForm(empty);
                  }}
                >
                  Cancel edit
                </button>
              )}
            </form>

            <div className="rounded-[1.75rem] bg-white p-5 shadow-card">
              <h2 className="font-semibold">CSV upload</h2>
              <p className="mt-1 text-xs text-navy/50">
                Columns: Sector Incharge Name, Sector Incharge Number, Assembly Name, Sector Allotted, Zone, District
              </p>
              <input
                type="file"
                accept=".csv"
                className="mt-3 w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadCsv(f);
                }}
              />
              <a href="/sample-users.csv" className="mt-2 inline-block text-sm text-teal">
                Download sample CSV
              </a>
              {csvMsg && <p className="mt-2 text-sm text-navy/70">{csvMsg}</p>}
            </div>
          </aside>

          <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-card">
            <div className="border-b border-navy/5 p-4">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, number, assembly…"
                className="w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-sand/70 text-xs uppercase tracking-wide text-navy/50">
                  <tr>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Number</th>
                    <th className="px-3 py-3">Assembly</th>
                    <th className="px-3 py-3">Sector</th>
                    <th className="px-3 py-3">Zone</th>
                    <th className="px-3 py-3">District</th>
                    <th className="px-3 py-3">Face</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-t border-navy/5">
                      <td className="px-3 py-3 font-medium">{u.name}</td>
                      <td className="px-3 py-3">{u.phone}</td>
                      <td className="px-3 py-3">{u.assemblyName}</td>
                      <td className="px-3 py-3">{u.sectorAllotted}</td>
                      <td className="px-3 py-3">{u.zone}</td>
                      <td className="px-3 py-3">{u.district}</td>
                      <td className="px-3 py-3">{u.faceRegistered ? "Yes" : "No"}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/admin/users/${u.id}`} className="text-teal">
                            Footprint
                          </Link>
                          <button
                            onClick={() => {
                              setEditing(u.id);
                              setForm({
                                name: u.name,
                                phone: u.phone,
                                assemblyName: u.assemblyName,
                                sectorAllotted: u.sectorAllotted,
                                zone: u.zone,
                                district: u.district,
                              });
                            }}
                            className="text-navy/70"
                          >
                            Edit
                          </button>
                          <button onClick={() => remove(u.id)} className="text-red-600">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && <p className="p-6 text-sm text-navy/50">No users yet. Upload CSV or create manually.</p>}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
