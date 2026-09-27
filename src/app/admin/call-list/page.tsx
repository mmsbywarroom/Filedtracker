"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CallCampaignPanel } from "@/components/CallCampaignPanel";

type Contact = {
  id: string;
  name: string;
  phone: string;
  vehicleNumber: string;
  assignedUsers: number;
};

type FieldUser = {
  id: string;
  name: string;
  phone: string;
  designation: string;
  assemblyName: string;
};

export default function CallListAdminPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<FieldUser[]>([]);
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(`/api/admin/call-contacts?q=${encodeURIComponent(q)}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setContacts(data.contacts || []);
    setUsers(data.users || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAssignment(id: string) {
    setUserId(id);
    if (!id) {
      setSelected({});
      return;
    }
    const res = await fetch(`/api/admin/call-contacts/assignments?userId=${encodeURIComponent(id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "Could not load assignment.");
      return;
    }
    const next: Record<string, boolean> = {};
    for (const contactId of data.contactIds || []) next[contactId] = true;
    setSelected(next);
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/call-contacts/csv", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "CSV upload failed.");
      return;
    }
    const errs = Array.isArray(data.errors) ? data.errors.length : 0;
    setMsg(
      `Created ${data.created || 0}, updated ${data.updated || 0}, auto-assigned ${data.assigned || 0}${errs ? `, ${errs} row errors` : ""}.`
    );
    setReloadToken((n) => n + 1);
    load();
  }

  async function saveAssignment() {
    if (!userId) {
      setMsg("Choose a field user first.");
      return;
    }
    setBusy(true);
    const contactIds = Object.keys(selected).filter((id) => selected[id]);
    const res = await fetch("/api/admin/call-contacts/assignments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, contactIds }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Could not save assignment.");
      return;
    }
    setMsg(`Saved. This user will see ${data.assigned || 0} numbers.`);
    load();
  }

  const assignedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);
  const filteredUsers = users;

  function downloadTemplate() {
    const blob = new Blob(["Person Name,Mobile,Vehicle Number,Assign User Mobile\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "call-list-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">People</p>
      <h1 className="text-2xl font-semibold text-ink">Call list</h1>
      <p className="mt-1 max-w-3xl text-sm text-navy/55">
        Upload numbers with the field user&apos;s mobile in Assign User Mobile. Matching users are assigned automatically. You can still assign from the list below.
      </p>
      <CallCampaignPanel reloadToken={reloadToken} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={downloadTemplate} className="admin-btn-secondary">
          Download CSV template
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="admin-btn-ink disabled:opacity-50">
          Upload CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
      </div>
      <p className="mt-2 text-xs text-navy/45">
        Columns: Person Name, Mobile, Vehicle Number, Assign User Mobile
      </p>
      {msg ? <p className="mt-3 text-sm text-navy/70">{msg}</p> : null}

      <section className="admin-panel mt-5 p-4">
        <h2 className="text-sm font-semibold">Assign numbers to a user</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-navy/55">
            Field user
            <select
              value={userId}
              onChange={(e) => loadAssignment(e.target.value)}
              className="mt-1 block h-11 min-w-[16rem] rounded-xl border border-navy/15 bg-white px-3 text-sm"
            >
              <option value="">Choose user</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.phone} · {u.designation}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={saveAssignment} disabled={busy || !userId} className="admin-btn-ink disabled:opacity-40">
            Save assignment ({assignedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const c of contacts) next[c.id] = true;
              setSelected(next);
            }}
            disabled={!contacts.length}
            className="admin-btn-secondary disabled:opacity-40"
          >
            Select all shown
          </button>
          <button type="button" onClick={() => setSelected({})} className="admin-btn-secondary">
            Clear
          </button>
        </div>
        <label className="mt-3 block text-xs font-medium text-navy/55">
          Search numbers
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load();
            }}
            placeholder="Name, mobile, vehicle"
            className="mt-1 block h-11 w-full max-w-md rounded-xl border border-navy/15 px-3 text-sm"
          />
        </label>
        <button type="button" onClick={load} className="mt-2 text-xs font-semibold text-teal">
          Search
        </button>
      </section>

      <section className="admin-panel mt-4 overflow-hidden">
        <div className="max-h-[560px] overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                {["Show", "Person name", "Mobile", "Vehicle number", "Assigned users"].map((h) => (
                  <th key={h} className="sticky top-0 z-10 bg-[#eef3fb] px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t border-navy/5">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[c.id])}
                      onChange={() => setSelected((s) => ({ ...s, [c.id]: !s[c.id] }))}
                      disabled={!userId}
                      aria-label={`Assign ${c.name}`}
                    />
                  </td>
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">{c.phone}</td>
                  <td className="px-4 py-2">{c.vehicleNumber || "—"}</td>
                  <td className="px-4 py-2">{c.assignedUsers}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!contacts.length ? <p className="p-6 text-sm text-navy/50">No numbers uploaded yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
