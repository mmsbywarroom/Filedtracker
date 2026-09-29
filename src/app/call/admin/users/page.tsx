"use client";

import { useEffect, useState } from "react";

type UserRow = {
  id: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  isActive: boolean;
};

export default function CallCenterUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/call/admin/users").then(async (res) => {
      if (res.status === 401) {
        window.location.href = "/call/admin/login";
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    });
  }, []);

  const shown = users.filter((u) => {
    const text = `${u.name} ${u.phone} ${u.assemblyName} ${u.zone} ${u.district}`.toLowerCase();
    return text.includes(q.trim().toLowerCase());
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Call center users</h1>
      <p className="mt-1 text-sm text-slate-600">These are the Call Center users from the attendance admin. Only this designation is listed.</p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or mobile"
        className="mt-4 h-11 w-full max-w-md rounded-xl border px-3 text-sm"
      />
      <div className="mt-4 overflow-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              {["Name", "Mobile", "Assembly", "Sector", "Zone", "District", "Status"].map((h) => (
                <th key={h} className="bg-slate-50 px-3 py-2 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2">{u.phone}</td>
                <td className="px-3 py-2">{u.assemblyName}</td>
                <td className="px-3 py-2">{u.sectorAllotted}</td>
                <td className="px-3 py-2">{u.zone}</td>
                <td className="px-3 py-2">{u.district}</td>
                <td className="px-3 py-2">{u.isActive ? "Active" : "Left"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length ? <p className="p-6 text-sm text-slate-500">No Call Center users found.</p> : null}
      </div>
    </main>
  );
}
