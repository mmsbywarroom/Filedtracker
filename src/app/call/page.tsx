"use client";

import { FormEvent, useState } from "react";

export default function CallLoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/call/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Could not send OTP.");
      return;
    }
    setSent(true);
    setMsg("OTP sent.");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/call/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Could not sign in.");
      return;
    }
    window.location.href = "/call/desk";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b6fbf] px-4">
      <form onSubmit={sent ? verify : requestOtp} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
        <img src="/aap-logo.png" alt="AAP" className="mx-auto h-12 w-auto" />
        <h1 className="mt-3 text-center text-xl font-semibold text-[#0b4f86]">AAP Calling Portal</h1>
        <p className="text-center text-sm text-slate-500">Booth member verification</p>
        <label className="mt-5 block text-sm font-medium">
          Mobile number
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            placeholder="10-digit mobile"
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
          />
        </label>
        {sent ? (
          <label className="mt-3 block text-sm font-medium">
            OTP
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="Enter OTP"
              className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3"
            />
          </label>
        ) : null}
        {msg ? <p className="mt-3 text-sm text-slate-600">{msg}</p> : null}
        <button type="submit" disabled={busy} className="mt-4 h-11 w-full rounded-xl bg-[#0b6fbf] font-semibold text-white disabled:opacity-50">
          {sent ? "Login" : "Send OTP"}
        </button>
        <a href="/call/admin/login" className="mt-4 block text-center text-xs text-slate-400">
          Admin login
        </a>
      </form>
    </main>
  );
}
