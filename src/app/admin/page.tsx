"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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

  const selectClass = "rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm";

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-teal">Users</p>
        <h1 className="text-2xl font-semibold">Sector incharges</h1>
      </div>

      <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-card">
        <div className="grid gap-3 border-b border-navy/5 p-4 md:grid-cols-3 lg:grid-cols-6">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, number…" className={`${selectClass} lg:col-span-2`} />
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
                      <Link href={`/admin/create?edit=${u.id}`} className="text-navy/70">
                        Edit
                      </Link>
                      <button onClick={() => remove(u.id)} className="text-red-600">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="p-6 text-sm text-navy/50">No matching users. Create a user or upload CSV.</p>}
        </div>
      </section>
    </main>
  );
}
