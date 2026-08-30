"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { DESIGNATIONS } from "@/lib/hierarchy";

type Holiday = { id: string; date: string; reason: string; designations: string[] };

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function densLabel(dens: string[]) {
  if (!dens.length) return "No designation";
  if (dens.length === DESIGNATIONS.length) return "All designations";
  if (dens.length <= 2) return dens.join(", ");
  return `${dens.slice(0, 2).join(", ")} +${dens.length - 2}`;
}

export default function HolidaysPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [pick, setPick] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const byDate = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);

  async function load() {
    const res = await fetch(`/api/admin/holidays?year=${year}&month=${month}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    if (res.status === 403) {
      window.location.replace("/admin");
      return;
    }
    const data = await res.json();
    setHolidays(data.holidays || []);
  }

  useEffect(() => {
    void load();
  }, [year, month]);

  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const days = new Date(year, month, 0).getDate();
    const pad = first.getDay();
    const out: ({ day: number; date: string } | null)[] = [];
    for (let i = 0; i < pad; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push({ day: d, date: ymd(year, month, d) });
    return out;
  }, [year, month]);

  function openDate(date: string) {
    const h = byDate.get(date);
    setPick(date);
    setReason(h?.reason || "");
    setSelected(h?.designations?.length ? [...h.designations] : []);
    setMsg("");
  }

  function toggleDen(d: string) {
    setSelected((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!pick) return;
    if (!selected.length) {
      setMsg("Select at least one designation. Punch-in is blocked only for those.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/admin/holidays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: pick, reason, designations: selected }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Could not save holiday");
      return;
    }
    setMsg(`Holiday saved. Leave + punch-in blocked only for: ${selected.join(", ")}`);
    setPick("");
    setReason("");
    setSelected([]);
    load();
  }

  async function remove(date: string) {
    if (!confirm(`Remove holiday on ${date}? Those designations will follow normal attendance again.`)) return;
    setBusy(true);
    await fetch(`/api/admin/holidays?date=${date}`, { method: "DELETE" });
    setBusy(false);
    setPick("");
    setReason("");
    setSelected([]);
    load();
  }

  function shift(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  const title = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
  const allSelected = selected.length === DESIGNATIONS.length;

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="admin-page-kicker">Attendance</p>
      <h1 className="admin-page-title">Holiday calendar</h1>
      <p className="admin-page-sub">
        Mark a date and pick designations. Only those designations are Leave that day — punch-in stays open for everyone else.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className="admin-btn-secondary" onClick={() => shift(-1)}>
          Previous
        </button>
        <p className="min-w-[10rem] text-center text-lg font-semibold">{title}</p>
        <button type="button" className="admin-btn-secondary" onClick={() => shift(1)}>
          Next
        </button>
      </div>

      <section className="admin-panel mt-4 p-4">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wider text-navy/45">
          {WEEK.map((w) => (
            <div key={w} className="py-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <div key={`e-${i}`} className="min-h-[4.5rem] rounded-xl" />;
            const h = byDate.get(c.date);
            return (
              <button
                key={c.date}
                type="button"
                onClick={() => openDate(c.date)}
                className={`min-h-[4.5rem] rounded-xl border p-2 text-left text-sm transition ${
                  h
                    ? "border-sky-300 bg-sky-50 text-sky-950"
                    : "border-[color:var(--admin-border)] bg-white hover:bg-[#eef5ff]"
                } ${pick === c.date ? "ring-2 ring-teal" : ""}`}
              >
                <span className="font-semibold">{c.day}</span>
                {h && (
                  <>
                    <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-sky-800">{h.reason}</p>
                    <p className="line-clamp-1 text-[10px] text-sky-700/80">{densLabel(h.designations || [])}</p>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {pick && (
        <section className="admin-panel mt-4 p-4">
          <h2 className="text-sm font-semibold">Holiday · {pick}</h2>
          <form onSubmit={save} className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-navy/60">
              Why is this a holiday?
              <textarea
                required
                minLength={3}
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Independence Day / Call Center weekly off"
                className="mt-1 min-h-[5rem] w-full px-3 py-2"
              />
            </label>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-navy/60">Designations on leave (punch-in blocked only for these)</p>
                <button
                  type="button"
                  className="text-xs font-semibold text-teal"
                  onClick={() => setSelected(allSelected ? [] : [...DESIGNATIONS])}
                >
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DESIGNATIONS.map((d) => (
                  <label
                    key={d}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                      selected.includes(d) ? "border-sky-300 bg-sky-50" : "border-[color:var(--admin-border)] bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(d)}
                      onChange={() => toggleDen(d)}
                    />
                    {d}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className="admin-btn-primary">
                Save holiday
              </button>
              {byDate.has(pick) && (
                <button type="button" disabled={busy} className="admin-btn-danger" onClick={() => remove(pick)}>
                  Remove
                </button>
              )}
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => {
                  setPick("");
                  setReason("");
                  setSelected([]);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
          {msg && <p className="mt-3 text-sm text-teal">{msg}</p>}
        </section>
      )}

      {!!holidays.length && (
        <section className="admin-panel mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Reason</th>
                <th>Designations</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap font-medium">{h.date}</td>
                  <td>{h.reason}</td>
                  <td>{densLabel(h.designations || [])}</td>
                  <td>
                    <button type="button" className="admin-btn-ghost" onClick={() => openDate(h.date)}>
                      Edit
                    </button>
                    <button type="button" className="admin-btn-danger ml-1" onClick={() => remove(h.date)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
