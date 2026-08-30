"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PaginationBar } from "@/components/PaginationBar";

type Rally = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  scheduledDate: string;
  isActive: boolean;
  userCount: number;
};
type RallyUser = {
  id: string;
  zone: string;
  district: string;
  acName: string;
  villageWard: string;
  name: string;
  phone: string;
  vehicleNo: string;
  pocName: string;
  pocNumber: string;
  vehicleType: string;
  rallyId: string;
  rally?: { name: string; isActive: boolean };
};

const emptyForm = {
  zone: "",
  district: "",
  acName: "",
  villageWard: "",
  name: "",
  phone: "",
  vehicleNo: "",
  pocName: "",
  pocNumber: "",
  vehicleType: "",
};

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmtRallyDate(ymd?: string) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}-${m}-${y}`;
}

export default function AdminRallyUsersPage() {
  const [rallies, setRallies] = useState<Rally[]>([]);
  const [users, setUsers] = useState<RallyUser[]>([]);
  const [rallyId, setRallyId] = useState("");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState<{ row: number; error: string }[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<RallyUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [venue, setVenue] = useState({ name: "", date: todayYmd(), lat: "", lng: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadRallies() {
    const res = await fetch("/api/admin/rallies");
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    const list: Rally[] = data.rallies || [];
    setRallies(list);
    const today = todayYmd();
    setRallyId((cur) => cur || list.find((r) => r.scheduledDate === today)?.id || list.find((r) => r.isActive)?.id || list[0]?.id || "");
  }

  async function loadUsers(id?: string) {
    const rid = id ?? rallyId;
    const params = new URLSearchParams();
    if (rid) params.set("rallyId", rid);
    if (qApplied) params.set("q", qApplied);
    const res = await fetch(`/api/admin/rally-users?${params}`);
    const data = await res.json();
    setUsers(data.users || []);
    setSelected({});
  }

  useEffect(() => {
    void loadRallies();
  }, []);

  useEffect(() => {
    if (rallyId) void loadUsers(rallyId);
  }, [rallyId, qApplied]);

  async function createRally(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/admin/rallies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: venue.name,
        scheduledDate: venue.date,
        lat: Number(venue.lat),
        lng: Number(venue.lng),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Could not create rally");
      return;
    }
    setVenue({ name: "", date: todayYmd(), lat: "", lng: "" });
    setMsg(
      venue.date === todayYmd()
        ? "Rally created and set as today's active rally."
        : `Rally scheduled for ${fmtRallyDate(venue.date)}. Users can check in on that date.`
    );
    await loadRallies();
    setRallyId(data.rally.id);
  }

  async function uploadCsv(file: File) {
    if (!rallyId) {
      setMsg("Create a rally first.");
      return;
    }
    setMsg("Uploading…");
    setErrors([]);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("rallyId", rallyId);
    const res = await fetch("/api/admin/rally-users/csv", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error || "CSV failed");
      return;
    }
    const errs = Array.isArray(data.errors) ? data.errors : [];
    setErrors(errs);
    setMsg(`Created ${data.created || 0}, updated ${data.updated || 0}${errs.length ? `, ${errs.length} row errors` : ""}`);
    loadUsers();
  }

  async function saveUser(e: FormEvent) {
    e.preventDefault();
    if (!rallyId) {
      setMsg("Create a rally first.");
      return;
    }
    setBusy(true);
    const url = editing ? `/api/admin/rally-users/${editing.id}` : "/api/admin/rally-users";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rallyId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Save failed");
      return;
    }
    setForm(emptyForm);
    setEditing(null);
    setMsg(editing ? "User updated." : "User created.");
    loadUsers();
  }

  async function remove(id: string) {
    if (!confirm("Delete this rally user?")) return;
    await fetch(`/api/admin/rally-users/${id}`, { method: "DELETE" });
    loadUsers();
  }

  async function bulkDelete(all = false) {
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!all && !ids.length) return;
    const label = all ? "ALL rally users for this rally" : `${ids.length} selected user(s)`;
    if (!confirm(`Delete ${label}?`)) return;
    setBusy(true);
    const res = await fetch("/api/admin/rally-users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(all ? { all: true, rallyId } : { ids }),
    });
    const data = await res.json();
    setBusy(false);
    setMsg(`Deleted ${data.deleted || 0} user(s).`);
    loadUsers();
  }

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return users.slice(start, start + pageSize);
  }, [users, page, pageSize]);

  useEffect(() => setPage(1), [qApplied, rallyId, pageSize, users.length]);

  const field = (key: keyof typeof emptyForm, label: string) => (
    <label className="block text-xs font-medium text-navy/60">
      {label}
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="mt-1 w-full px-3 py-2"
      />
    </label>
  );

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Rally</p>
      <h1 className="admin-page-title">Rally users</h1>
      <p className="admin-page-sub">
        Schedule a rally date, then add users. Check-in opens only on that date — you can prepare CSV days ahead.
      </p>

      <section className="admin-panel mt-5 p-4">
        <h2 className="text-sm font-semibold">Create rally / venue</h2>
        <form onSubmit={createRally} className="mt-3 grid gap-3 md:grid-cols-5">
          <input
            required
            placeholder="Venue name"
            value={venue.name}
            onChange={(e) => setVenue((v) => ({ ...v, name: e.target.value }))}
            className="px-3 py-2"
          />
          <label className="block text-xs font-medium text-navy/55">
            Rally date
            <input
              required
              type="date"
              value={venue.date}
              onChange={(e) => setVenue((v) => ({ ...v, date: e.target.value }))}
              className="mt-1 w-full px-3 py-2"
            />
          </label>
          <input
            required
            placeholder="Latitude"
            value={venue.lat}
            onChange={(e) => setVenue((v) => ({ ...v, lat: e.target.value }))}
            className="px-3 py-2 md:mt-5"
          />
          <input
            required
            placeholder="Longitude"
            value={venue.lng}
            onChange={(e) => setVenue((v) => ({ ...v, lng: e.target.value }))}
            className="px-3 py-2 md:mt-5"
          />
          <button disabled={busy} className="admin-btn-primary md:mt-5">
            Create rally
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-sm text-navy/60">Select rally</label>
          <select
            value={rallyId}
            onChange={(e) => setRallyId(e.target.value)}
            className="px-3 py-2"
          >
            {rallies.map((r) => (
              <option key={r.id} value={r.id}>
                {fmtRallyDate(r.scheduledDate)} · {r.name} {r.isActive ? "(active)" : ""} · {r.userCount} users
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="admin-panel mt-4 p-4">
        <h2 className="text-sm font-semibold">CSV upload</h2>
        <p className="mt-1 text-xs text-navy/55">
          Columns: Zone, District, Ac Name, Village/Ward, User Name, Number, Vehicle No, POC Name, POC Number, Vehicle Type
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/sample-rally-users.csv" download className="admin-btn-secondary">
            Download CSV template
          </a>
          <button type="button" onClick={() => fileRef.current?.click()} className="admin-btn-teal-soft">
            Upload CSV
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
      </section>

      <section className="admin-panel mt-4 p-4">
        <h2 className="text-sm font-semibold">{editing ? "Edit user" : "Create user"}</h2>
        <form onSubmit={saveUser} className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          {field("name", "User Name")}
          {field("phone", "Number")}
          {field("zone", "Zone")}
          {field("district", "District")}
          {field("acName", "Ac Name")}
          {field("villageWard", "Village/Ward")}
          {field("vehicleNo", "Vehicle No")}
          {field("vehicleType", "Vehicle Type")}
          {field("pocName", "POC Name")}
          {field("pocNumber", "POC Number")}
          <div className="flex items-end gap-2">
            <button disabled={busy} className="admin-btn-primary">
              {editing ? "Save" : "Add user"}
            </button>
            {editing && (
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {msg && (
        <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm shadow-card">
          <p className="font-medium">{msg}</p>
          {errors.length > 0 && (
            <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-xs text-rose-700">
              {errors.map((e, i) => (
                <li key={`${e.row}-${i}`}>
                  Row {e.row}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="admin-toolbar mt-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or mobile"
          className="min-w-[200px] flex-1 px-3 py-2"
        />
        <button type="button" className="admin-btn-primary" onClick={() => setQApplied(q.trim())}>
          Search
        </button>
        <button type="button" className="admin-btn-secondary" onClick={() => { setQ(""); setQApplied(""); }}>
          Clear
        </button>
        <button type="button" disabled={busy} className="admin-btn-danger" onClick={() => bulkDelete(false)}>
          Delete selected
        </button>
        <button type="button" disabled={busy} className="admin-btn-warn" onClick={() => bulkDelete(true)}>
          Delete all
        </button>
        <p className="text-sm text-navy/55">{users.length} users</p>
      </div>

      <section className="admin-panel mt-4">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px]">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={pageRows.length > 0 && pageRows.every((u) => selected[u.id])}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setSelected((s) => {
                        const next = { ...s };
                        for (const u of pageRows) next[u.id] = on;
                        return next;
                      });
                    }}
                  />
                </th>
                <th className="sticky left-10 z-10 bg-[color:var(--admin-head)]">Actions</th>
                <th>User Name</th>
                <th>Number</th>
                <th>Zone</th>
                <th>District</th>
                <th>Ac Name</th>
                <th>Village/Ward</th>
                <th>Vehicle No</th>
                <th>Vehicle Type</th>
                <th>POC Name</th>
                <th>POC Number</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Boolean(selected[u.id])}
                      onChange={() => setSelected((s) => ({ ...s, [u.id]: !s[u.id] }))}
                    />
                  </td>
                  <td className="sticky left-10 z-10 whitespace-nowrap bg-white">
                    <button
                      type="button"
                      className="admin-btn-ghost"
                      onClick={() => {
                        setEditing(u);
                        setForm({
                          zone: u.zone,
                          district: u.district,
                          acName: u.acName,
                          villageWard: u.villageWard,
                          name: u.name,
                          phone: u.phone,
                          vehicleNo: u.vehicleNo,
                          pocName: u.pocName,
                          pocNumber: u.pocNumber,
                          vehicleType: u.vehicleType,
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" className="admin-btn-danger ml-1" onClick={() => remove(u.id)}>
                      Delete
                    </button>
                  </td>
                  <td>{u.name}</td>
                  <td>{u.phone}</td>
                  <td>{u.zone}</td>
                  <td>{u.district}</td>
                  <td>{u.acName}</td>
                  <td>{u.villageWard}</td>
                  <td>{u.vehicleNo}</td>
                  <td>{u.vehicleType}</td>
                  <td>{u.pocName}</td>
                  <td>{u.pocNumber}</td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-navy/50">
                    No rally users yet. Create a rally and upload CSV.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={users.length} onPage={setPage} onPageSize={setPageSize} />
      </section>
    </main>
  );
}
