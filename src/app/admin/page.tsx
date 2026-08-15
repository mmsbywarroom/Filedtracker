"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FacePhoto } from "@/components/FacePhoto";

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
  faceImage: string | null;
};

function unique(rows: UserRow[], key: keyof UserRow) {
  return Array.from(new Set(rows.map((r) => String(r[key])).filter(Boolean))).sort();
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [assembly, setAssembly] = useState("");
  const [sector, setSector] = useState("");
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [face, setFace] = useState("");

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

  async function remove(id: string) {
    if (!confirm("Delete this user and all footprints?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const text = [u.name, u.phone, u.assemblyName, u.sectorAllotted, u.zone, u.district].join(" ").toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (assembly && u.assemblyName !== assembly) return false;
      if (sector && u.sectorAllotted !== sector) return false;
      if (zone && u.zone !== zone) return false;
      if (district && u.district !== district) return false;
      if (face === "yes" && !u.faceRegistered) return false;
      if (face === "no" && u.faceRegistered) return false;
      return true;
    });
  }, [users, q, assembly, sector, zone, district, face]);

  const selectClass = "h-11 rounded-xl border border-navy/10 bg-white px-3 text-sm outline-none focus:border-teal";

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-teal">Users</p>
          <h1 className="text-2xl font-semibold text-ink">Sector incharges</h1>
          <p className="mt-1 text-sm text-navy/55">{filtered.length} of {users.length} users</p>
        </div>
        <Link href="/admin/create" className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white shadow-card">
          Create user
        </Link>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl bg-white p-4 shadow-card md:grid-cols-3 lg:grid-cols-6">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or number" className={`${selectClass} lg:col-span-2`} />
        <select value={assembly} onChange={(e) => setAssembly(e.target.value)} className={selectClass}>
          <option value="">All assemblies</option>
          {unique(users, "assemblyName").map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select value={sector} onChange={(e) => setSector(e.target.value)} className={selectClass}>
          <option value="">All sectors</option>
          {unique(users, "sectorAllotted").map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} className={selectClass}>
          <option value="">All zones</option>
          {unique(users, "zone").map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select value={district} onChange={(e) => setDistrict(e.target.value)} className={selectClass}>
          <option value="">All districts</option>
          {unique(users, "district").map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select value={face} onChange={(e) => setFace(e.target.value)} className={selectClass}>
          <option value="">Face: all</option>
          <option value="yes">Face registered</option>
          <option value="no">Face pending</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
        <div className="max-h-[calc(100vh-220px)] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                <th className="px-4 py-3">Incharge</th>
                <th className="px-4 py-3">Assembly / Sector</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Face</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-navy/5 hover:bg-[#f7f9fd]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FacePhoto src={u.faceImage} label={u.name} />
                      <div>
                        <p className="font-semibold text-ink">{u.name}</p>
                        <p className="text-xs text-navy/50">{u.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.assemblyName}</p>
                    <p className="text-xs text-navy/50">{u.sectorAllotted}</p>
                  </td>
                  <td className="px-4 py-3">{u.zone}</td>
                  <td className="px-4 py-3">{u.district}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${u.faceRegistered ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                      {u.faceRegistered ? "Registered" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/admin/users/${u.id}`} className="rounded-lg bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal">
                        Footprint
                      </Link>
                      <Link href={`/admin/create?edit=${u.id}`} className="rounded-lg bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy/70">
                        Edit
                      </Link>
                      <button onClick={() => remove(u.id)} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="p-8 text-center text-sm text-navy/50">No matching users. Create a user or upload CSV.</p>}
        </div>
      </section>
    </main>
  );
}
