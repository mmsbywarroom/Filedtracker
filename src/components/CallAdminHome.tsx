"use client";

import { useEffect, useRef, useState } from "react";

const LIST_CACHE = "ft-call-admin-list";

type Contact = {
  id: string;
  zone: string;
  district: string;
  halka: string;
  villageWard: string;
  block: string;
  name: string;
  phone: string;
  age: string;
  gender: string;
  education: string;
  position: string;
  fatherName: string;
  assigneePhone: string;
  status: string;
};

type Caller = { phone: string; assigned: number };
type Agent = { name: string; phone: string };

export function CallAdminHome() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [callers, setCallers] = useState<Caller[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assigning, setAssigning] = useState("");
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(search = q) {
    const res = await fetch(`/api/call/admin/contacts?q=${encodeURIComponent(search)}`);
    if (res.status === 401) {
      window.location.href = "/call/admin/login";
      return;
    }
    const data = await res.json();
    setContacts(data.contacts || []);
    setCallers(data.callers || []);
    setAgents(data.agents || []);
    if (!search) {
      try {
        sessionStorage.setItem(LIST_CACHE, JSON.stringify({ contacts: data.contacts, callers: data.callers, agents: data.agents }));
      } catch {
        /* ignore quota */
      }
    }
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LIST_CACHE);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.contacts)) setContacts(data.contacts);
        if (Array.isArray(data.callers)) setCallers(data.callers);
        if (Array.isArray(data.agents)) setAgents(data.agents);
      }
    } catch {
      /* ignore bad cache */
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(file: File) {
    setBusy(true);
    setMsg("Uploading…");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/call/admin/contacts", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "CSV upload failed.");
      return;
    }
    const errs = Array.isArray(data.errors) ? data.errors : [];
    const first = errs[0] ? ` Row ${errs[0].row}: ${errs[0].error}` : "";
    setMsg(`Created ${data.created || 0}, updated ${data.updated || 0}, assigned ${data.assigned || 0}${errs.length ? `, ${errs.length} row errors.${first}` : ""}.`);
    load();
  }

  function template() {
    const blob = new Blob(
      ["Zone,District,Halka,Village/Ward,Block,Name,Phone,Age,Gender,Education,Position,Father Name,Assigned users\n"],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "calling-list-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function assign(id: string, assigneePhone: string) {
    setAssigning(id);
    setMsg("");
    const res = await fetch("/api/call/admin/contacts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, assigneePhone }),
    });
    const data = await res.json().catch(() => ({}));
    setAssigning("");
    if (!res.ok) {
      setMsg(data.error || "Could not assign this number.");
      return;
    }
    setMsg(assigneePhone ? "Caller assigned." : "Caller removed.");
    load();
  }

  async function deleteAll() {
    if (!window.confirm("Delete all call numbers and saved answers? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch("/api/call/admin/contacts?all=1", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setMsg("Could not delete call numbers.");
      return;
    }
    setMsg("Deleted.");
    load();
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-semibold">Call list</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">
          Assigned users is the caller mobile. Pick a caller on a row to assign it by hand. That person signs in with OTP on call.aappunjab.in and sees only those rows.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={template} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Download CSV template</button>
          <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-xl bg-[#0A1628] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Upload CSV</button>
          <button type="button" disabled={busy} onClick={deleteAll} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-700">Delete all</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">Columns: Zone, District, Halka, Village/Ward, Block, Name, Phone, Age, Gender, Education, Position, Father Name, Assigned users. In Excel use Save As, then CSV UTF-8.</p>
        {msg ? <p className="mt-3 text-sm">{msg}</p> : null}

        <section className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Callers</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {callers.map((c) => (
              <button key={c.phone} type="button" onClick={() => { setQ(c.phone); void load(c.phone); }} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                {c.phone} · {c.assigned}
              </button>
            ))}
            {!callers.length ? <p className="text-sm text-slate-500">No assigned mobiles yet.</p> : null}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, halka" className="h-10 flex-1 rounded-xl border px-3 text-sm" />
            <button type="button" onClick={() => load()} className="rounded-xl bg-slate-900 px-3 text-sm font-semibold text-white">Search</button>
          </div>
        </section>

        <div className="mt-4 overflow-auto rounded-2xl bg-white shadow-sm">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr>
                {["#", "Zone", "District", "Halka", "Village/Ward", "Block", "Name", "Phone", "Age", "Gender", "Education", "Position", "Father Name", "Assigned users", "Status"].map((h) => (
                  <th key={h} className="sticky top-0 bg-slate-50 px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={c.id} className="border-t">
                  <td className="px-3 py-2 font-medium text-slate-500">{i + 1}</td>
                  <td className="px-3 py-2">{c.zone}</td>
                  <td className="px-3 py-2">{c.district}</td>
                  <td className="px-3 py-2">{c.halka}</td>
                  <td className="px-3 py-2">{c.villageWard}</td>
                  <td className="px-3 py-2">{c.block}</td>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      {c.phone}
                      <CopyPhone phone={c.phone} />
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.age}</td>
                  <td className="px-3 py-2">{c.gender}</td>
                  <td className="px-3 py-2">{c.education}</td>
                  <td className="px-3 py-2">{c.position}</td>
                  <td className="px-3 py-2">{c.fatherName}</td>
                  <td className="px-3 py-2">
                    <select
                      value={callerPhone(c.assigneePhone)}
                      disabled={assigning === c.id}
                      onChange={(e) => void assign(c.id, e.target.value)}
                      className="h-8 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2"
                    >
                      <option value="">Unassigned</option>
                      {c.assigneePhone && !agents.some((a) => callerPhone(a.phone) === callerPhone(c.assigneePhone)) ? (
                        <option value={callerPhone(c.assigneePhone)}>{c.assigneePhone}</option>
                      ) : null}
                      {agents.map((a) => (
                        <option key={a.phone} value={callerPhone(a.phone)}>
                          {a.name} · {callerPhone(a.phone)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{c.status || "Fresh"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!contacts.length ? <p className="p-6 text-sm text-slate-500">No numbers uploaded yet.</p> : null}
        </div>
    </main>
  );
}

function callerPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits || phone;
}

function CopyPhone({ phone }: { phone: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(phone);
        setDone(true);
        window.setTimeout(() => setDone(false), 1200);
      }}
      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}
