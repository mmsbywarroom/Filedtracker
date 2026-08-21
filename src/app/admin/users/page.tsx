"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { FacePhoto } from "@/components/FacePhoto";
import { PaginationBar } from "@/components/PaginationBar";
import { DESIGNATIONS } from "@/lib/hierarchy";

type UserRow = {
  id: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  cluster: string;
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
  const [designation, setDesignation] = useState("");
  const [zone, setZone] = useState("");
  const [district, setDistrict] = useState("");
  const [face, setFace] = useState("");
  const [status, setStatus] = useState("");
  const [isSuper, setIsSuper] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [csvMsg, setCsvMsg] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setUsers(data.users || []);
    setSelected({});
  }

  useEffect(() => {
    load();
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => setIsSuper(Boolean(d.admin?.isSuper)))
      .catch(() => {});
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this user and all footprints?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function resetFace(u: UserRow) {
    if (!confirm(`Clear face for ${u.name}? They must register face again on punch.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearFace: true }),
    });
    if (res.ok) load();
  }

  async function bulkDelete() {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected user(s) and all their footprints?`)) return;
    setBulkBusy(true);
    const res = await fetch("/api/admin/users", {
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
    setCsvMsg(`Deleted ${data.deleted || 0} user(s).`);
    load();
  }

  async function toggleActive(u: UserRow) {
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((row) => (row.id === u.id ? { ...row, isActive: !u.isActive } : row)));
    }
  }

  async function uploadCsv(file: File) {
    setCsvMsg("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/users/csv", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setCsvMsg(data.error || "CSV upload failed");
      return;
    }
    setCsvMsg(
      `Created ${data.created}, updated ${data.updated}${data.errors?.length ? `, ${data.errors.length} row errors` : ""}`
    );
    load();
  }

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const text = [u.name, u.phone, u.assemblyName, u.sectorAllotted, u.zone, u.district, u.designation, u.cluster]
        .join(" ")
        .toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (assembly && u.assemblyName !== assembly) return false;
      if (designation && u.designation !== designation) return false;
      if (zone && u.zone !== zone) return false;
      if (district && u.district !== district) return false;
      if (face === "yes" && !u.faceRegistered) return false;
      if (face === "no" && u.faceRegistered) return false;
      if (status === "active" && !u.isActive) return false;
      if (status === "inactive" && u.isActive) return false;
      return true;
    });
  }, [users, q, assembly, designation, zone, district, face, status]);

  useEffect(() => {
    setPage(1);
  }, [q, assembly, designation, zone, district, face, status, pageSize]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);
  const pageAllSelected = pageRows.length > 0 && pageRows.every((u) => selected[u.id]);

  function toggleOne(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function togglePage() {
    setSelected((s) => {
      const next = { ...s };
      const turnOn = !pageAllSelected;
      for (const u of pageRows) next[u.id] = turnOn;
      return next;
    });
  }

  function selectFiltered() {
    setSelected((s) => {
      const next = { ...s };
      for (const u of filtered) next[u.id] = true;
      return next;
    });
  }

  const selectClass = "h-11 rounded-xl border border-navy/10 bg-white px-3 text-sm outline-none focus:border-teal";

  return (
    <main className="px-4 py-6 md:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-teal">Users</p>
          <h1 className="text-2xl font-semibold text-ink">Field users</h1>
          <p className="mt-1 text-sm text-navy/55">
            {filtered.length} of {users.length} users
          </p>
        </div>
        {isSuper && (
          <div className="flex flex-wrap gap-2">
            <a
              href="/sample-users.csv"
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
            <Link href="/admin/create" className="rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-white shadow-card">
              Create user
            </Link>
          </div>
        )}
      </div>

      {csvMsg && <p className="mb-3 rounded-xl bg-white px-4 py-2 text-sm text-navy/70 shadow-card">{csvMsg}</p>}

      <div className="mb-4 grid gap-3 rounded-2xl bg-white p-4 shadow-card md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or number"
          className={`${selectClass} lg:col-span-2 xl:col-span-1`}
        />
        <select value={designation} onChange={(e) => setDesignation(e.target.value)} className={selectClass}>
          <option value="">All designations</option>
          {DESIGNATIONS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select value={assembly} onChange={(e) => setAssembly(e.target.value)} className={selectClass}>
          <option value="">All assemblies</option>
          {unique(users, "assemblyName").map((v) => (
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
          <option value="">Status: all</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isSuper && selectedCount > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-red-100 bg-red-50/80 px-4 py-3">
          <p className="text-sm font-medium text-red-800">{selectedCount} selected</p>
          <button
            type="button"
            onClick={selectFiltered}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-navy/70 shadow-sm"
          >
            Select all filtered ({filtered.length})
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

      <section className="overflow-hidden rounded-2xl border border-navy/5 bg-white shadow-card">
        <div className="overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[#eef3fb] text-[11px] font-semibold uppercase tracking-wider text-navy/55">
              <tr>
                {isSuper && (
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={pageAllSelected}
                      onChange={togglePage}
                      aria-label="Select page"
                      className="h-4 w-4 rounded border-navy/20"
                    />
                  </th>
                )}
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3">Assembly / Sector</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Face</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((u) => (
                <tr key={u.id} className={`border-t border-navy/5 hover:bg-[#f7f9fd] ${u.isActive ? "" : "opacity-70"}`}>
                  {isSuper && (
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[u.id])}
                        onChange={() => toggleOne(u.id)}
                        aria-label={`Select ${u.name}`}
                        className="h-4 w-4 rounded border-navy/20"
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FacePhoto src={u.faceImage} label={u.name} />
                      <div>
                        <p className="font-semibold text-ink">{u.name}</p>
                        <p className="text-xs text-navy/50">{u.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{u.designation}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{u.assemblyName}</p>
                    <p className="text-xs text-navy/50">{u.sectorAllotted}</p>
                  </td>
                  <td className="px-4 py-3">{u.zone}</td>
                  <td className="px-4 py-3">{u.district}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        u.faceRegistered ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {u.faceRegistered ? "Registered" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleActive(u)}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        u.isActive ? "bg-emerald-50 text-emerald-700" : "bg-navy/10 text-navy/60"
                      }`}
                    >
                      {u.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link href={`/admin/users/${u.id}`} className="rounded-lg bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal">
                        Footprint
                      </Link>
                      {isSuper && (
                        <>
                          <Link
                            href={`/admin/create?edit=${u.id}`}
                            className="rounded-lg bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy/70"
                          >
                            Edit
                          </Link>
                          {u.faceRegistered && (
                            <button
                              type="button"
                              onClick={() => resetFace(u)}
                              className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
                            >
                              Reset face
                            </button>
                          )}
                          <button onClick={() => remove(u.id)} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <p className="p-8 text-center text-sm text-navy/50">
              {users.length ? "No matching users." : "No users in your assignment."}
            </p>
          )}
        </div>
        {!!filtered.length && (
          <PaginationBar
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={setPageSize}
          />
        )}
      </section>
    </main>
  );
}
