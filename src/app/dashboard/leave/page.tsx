"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useLang } from "@/lib/i18n";

type Leave = {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
};

function todayIst() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

export default function LeavePage() {
  const { t } = useLang();
  const [fromDate, setFromDate] = useState(todayIst);
  const [toDate, setToDate] = useState(todayIst);
  const [reason, setReason] = useState("");
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/leave");
    if (res.status === 401) {
      window.location.href = "/";
      return;
    }
    const data = await res.json();
    setLeaves(data.leaves || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromDate, toDate, reason }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setOk(false);
      setMsg(data.error || "Could not send leave request.");
      return;
    }
    setOk(true);
    setMsg(t("leaveSent"));
    setReason("");
    load();
  }

  return (
    <main className="min-h-screen bg-sand">
      <div className="mx-auto max-w-3xl px-4 py-5">
        <header className="mb-4 flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <BrandMark size={52} />
            <div>
              <Link href="/dashboard" className="text-xs text-navy/50">
                ← {t("backDash")}
              </Link>
              <h1 className="font-semibold">{t("leaveRequest")}</h1>
            </div>
          </div>
          <LangToggle tone="light" />
        </header>

        <form onSubmit={submit} className="rounded-[1.75rem] bg-white p-5 shadow-card">
          <p className="text-sm text-navy/60">{t("leaveHint")}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-navy/55">
              {t("fromDate")}
              <input
                type="date"
                required
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-navy/55">
              {t("toDate")}
              <input
                type="date"
                required
                value={toDate}
                min={fromDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2.5 text-sm"
              />
            </label>
          </div>
          <label className="mt-3 block text-xs font-medium text-navy/55">
            {t("leaveReason")}
            <textarea
              required
              minLength={3}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("leaveReasonPh")}
              className="mt-1 w-full rounded-xl border border-navy/10 bg-sand/40 px-3 py-2.5 text-sm"
            />
          </label>
          {msg && <p className={`mt-3 text-sm ${ok ? "text-teal" : "text-red-600"}`}>{msg}</p>}
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-teal py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? t("sending") : t("submitLeave")}
          </button>
        </form>

        <section className="mt-5 overflow-hidden rounded-[1.75rem] bg-white shadow-card">
          <div className="border-b border-navy/5 px-4 py-3 font-semibold">{t("myLeaves")}</div>
          {!leaves.length && <p className="p-6 text-sm text-navy/50">{t("noLeaves")}</p>}
          {leaves.map((l) => (
            <div key={l.id} className="border-t border-navy/5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {fmt(l.fromDate)} → {fmt(l.toDate)}
                  </p>
                  <p className="mt-1 text-sm text-navy/70">{l.reason}</p>
                  {l.adminNote && <p className="mt-1 text-xs text-navy/50">{t("adminNote")}: {l.adminNote}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    l.status === "approved"
                      ? "bg-emerald-50 text-emerald-700"
                      : l.status === "rejected"
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {l.status === "approved" ? t("approved") : l.status === "rejected" ? t("rejected") : t("pending")}
                </span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
