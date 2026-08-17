"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FacePhoto } from "@/components/FacePhoto";

type Row = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  assemblyName: string;
  designation: string;
  sectorAllotted: string;
  zone: string;
  district: string;
  faceImage: string | null;
  punchInFace: string | null;
  punchOutFace: string | null;
  punchInAt: string;
  punchOutAt: string | null;
  punchInAddress: string | null;
  punchOutAddress: string | null;
  distanceMeters: number;
  marks: number;
  status: string;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function DailyRecordsPage() {
  const [date, setDate] = useState(todayIst);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  async function load(d: string) {
    const res = await fetch(`/api/admin/attendance?date=${d}`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    const data = await res.json();
    setRows(data.records || []);
  }

  useEffect(() => {
    load(date);
  }, [date]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const text = [r.name, r.phone, r.assemblyName, r.sectorAllotted, r.zone, r.district, r.designation].join(" ").toLowerCase();
      if (q && !text.includes(q.toLowerCase())) return false;
      if (status && r.status !== status) return false;
      return true;
    });
  }, [rows, q, status]);

  const live = rows.filter((r) => r.status === "Live").length;
  const done = rows.filter((r) => r.status === "Completed").length;

  return (
    <main className="px-4 py-6 md:px-8">
      <p className="text-xs uppercase tracking-[0.2em] text-teal">Attendance</p>
      <h1 className="text-2xl font-semibold">Daily records</h1>
      <p className="mt-1 text-sm text-navy/60">
        {rows.length} punches · {live} live · {done} completed
      </p>

      <div className="mt-4 mb-4 flex flex-wrap gap-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user…" className="rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-navy/10 bg-white px-3 py-2 text-sm">
          <option value="">All status</option>
          <option value="Live">Live</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-sand/70 text-xs uppercase tracking-wide text-navy/50">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Number</th>
                <th className="px-3 py-3">Designation</th>
                <th className="px-3 py-3">Sector</th>
                <th className="px-3 py-3">Registered</th>
                <th className="px-3 py-3">Punch in</th>
                <th className="px-3 py-3">In face</th>
                <th className="px-3 py-3">Punch out</th>
                <th className="px-3 py-3">Out face</th>
                <th className="px-3 py-3">Distance</th>
                <th className="px-3 py-3">Marks</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Map</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-navy/5 align-top">
                  <td className="px-3 py-3 font-medium">{r.name}</td>
                  <td className="px-3 py-3">{r.phone}</td>
                  <td className="px-3 py-3">{r.designation}</td>
                  <td className="px-3 py-3">{r.sectorAllotted}</td>
                  <td className="px-3 py-3">
                    <FacePhoto src={r.faceImage} label={`${r.name} registered`} />
                  </td>
                  <td className="px-3 py-3">
                    {new Date(r.punchInAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}
                    {r.punchInAddress ? <p className="max-w-[160px] text-xs text-navy/50">{r.punchInAddress}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <FacePhoto src={r.punchInFace} label={`${r.name} punch in`} />
                  </td>
                  <td className="px-3 py-3">
                    {r.punchOutAt
                      ? new Date(r.punchOutAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })
                      : "—"}
                    {r.punchOutAddress ? <p className="max-w-[160px] text-xs text-navy/50">{r.punchOutAddress}</p> : null}
                  </td>
                  <td className="px-3 py-3">
                    <FacePhoto src={r.punchOutFace} label={`${r.name} punch out`} />
                  </td>
                  <td className="px-3 py-3">{(r.distanceMeters / 1000).toFixed(2)} km</td>
                  <td className="px-3 py-3">{r.marks}</td>
                  <td className="px-3 py-3">{r.status}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/users/${r.userId}`} className="text-teal">
                      Footprint
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <p className="p-6 text-sm text-navy/50">No records for this date.</p>}
        </div>
      </section>
    </main>
  );
}
