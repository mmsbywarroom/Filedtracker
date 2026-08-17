"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import RouteMap from "@/components/RouteMapDynamic";
import { LangToggle, useLang } from "@/lib/i18n";
import { formatDuration, formatKm } from "@/lib/utils";

type Row = {
  id: string;
  punchInAt: string;
  punchOutAt: string | null;
  punchInLat: number;
  punchInLng: number;
  punchOutLat: number | null;
  punchOutLng: number | null;
  punchInAddress: string | null;
  punchOutAddress: string | null;
  distanceMeters: number;
  marks: number;
  status: "done" | "live";
};

type Track = Row & { points: { lat: number; lng: number; recordedAt: string }[] };

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export default function FootprintsPage() {
  const { t } = useLang();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayIst());
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [active, setActive] = useState<Track | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapBusy, setMapBusy] = useState(false);

  async function load() {
    setLoading(true);
    setActive(null);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);
    const res = await fetch(`/api/attendance/history?${params}`);
    if (res.status === 401) {
      window.location.href = "/";
      return;
    }
    const data = await res.json();
    setRows(data.records || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const code = r.id.slice(-6).toLowerCase();
      const when = new Date(r.punchInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }).toLowerCase();
      const text = [when, r.punchInAddress, r.punchOutAddress, r.status, code].join(" ").toLowerCase();
      return text.includes(needle);
    });
  }, [rows, q]);

  async function openMap(row: Row) {
    if (active?.id === row.id) return;
    setMapBusy(true);
    const res = await fetch(`/api/attendance/${row.id}`);
    const data = await res.json();
    setActive(data.attendance || null);
    setMapBusy(false);
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="mx-auto max-w-6xl px-4 py-5">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 shadow-card">
          <div>
            <Link href="/dashboard" className="text-xs text-navy/50">
              ← {t("backDash")}
            </Link>
            <h1 className="font-semibold">{t("recent")}</h1>
            <p className="text-sm text-navy/55">
              {filtered.length} {t("records")}
            </p>
          </div>
          <LangToggle tone="light" />
        </header>

        <div className="mb-4 grid gap-2 rounded-[1.5rem] bg-white p-3 shadow-card sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-medium text-navy/55">
            {t("fromDate")}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-navy/55">
            {t("toDate")}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="block text-xs font-medium text-navy/55">
            {t("status")}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm text-ink"
            >
              <option value="">{t("statusAll")}</option>
              <option value="done">{t("completed")}</option>
              <option value="live">{t("inProgress")}</option>
            </select>
          </label>
          <label className="block text-xs font-medium text-navy/55">
            {t("searchCode")}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchCodePh")}
              className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            onClick={load}
            className="sm:col-span-2 lg:col-span-4 rounded-xl bg-teal py-2.5 text-sm font-semibold text-white"
          >
            {t("applyFilter")}
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-2">
            {loading && <p className="px-2 text-sm text-navy/50">{t("loading")}</p>}
            {!loading && !filtered.length && <p className="px-2 text-sm text-navy/50">{t("noFootprints")}</p>}
            {filtered.map((r) => {
              const dur = r.punchOutAt
                ? new Date(r.punchOutAt).getTime() - new Date(r.punchInAt).getTime()
                : Date.now() - new Date(r.punchInAt).getTime();
              const code = r.id.slice(-6).toUpperCase();
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => openMap(r)}
                  className={`w-full rounded-2xl px-4 py-3 text-left shadow-card ${
                    active?.id === r.id ? "bg-ink text-white" : "bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {new Date(r.punchInAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      active?.id === r.id ? "bg-white/15" : "bg-sand text-navy/60"
                    }`}>
                      {t("userCode")} {code}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm ${active?.id === r.id ? "text-white/70" : "text-navy/55"}`}>
                    {r.punchOutAt
                      ? `${t("outAt")} ${new Date(r.punchOutAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}`
                      : t("inProgress")}{" "}
                    · {formatDuration(dur)} · {formatKm(r.distanceMeters)}
                  </p>
                  {r.punchInAddress && (
                    <p className={`mt-1 truncate text-xs ${active?.id === r.id ? "text-white/55" : "text-navy/45"}`}>
                      {r.punchInAddress}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          <div className="h-[52vh] min-h-[320px] overflow-hidden rounded-[2rem] bg-white shadow-float lg:h-[70vh]">
            {mapBusy && <div className="grid h-full place-items-center text-sm text-navy/50">{t("loading")}</div>}
            {!mapBusy && active && (
              <RouteMap
                points={active.points || []}
                punchIn={{ lat: active.punchInLat, lng: active.punchInLng }}
                punchOut={
                  active.punchOutLat != null && active.punchOutLng != null
                    ? { lat: active.punchOutLat, lng: active.punchOutLng }
                    : null
                }
                durationMs={
                  active.punchOutAt
                    ? new Date(active.punchOutAt).getTime() - new Date(active.punchInAt).getTime()
                    : Date.now() - new Date(active.punchInAt).getTime()
                }
                distanceMeters={active.distanceMeters}
              />
            )}
            {!mapBusy && !active && (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-navy/45">{t("tapFootprint")}</div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
