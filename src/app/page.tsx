"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function HomePage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Could not send OTP");
      return;
    }
    setStep("otp");
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, otp }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "OTP failed");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(1200px_600px_at_10%_-10%,#99f6e4_0%,transparent_50%),radial-gradient(800px_400px_at_100%_0%,#bfdbfe_0%,transparent_45%),linear-gradient(180deg,#f4efe6_0%,#eef3f0_100%)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-ink text-white font-bold">FT</div>
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-navy/50">Field operations</p>
              <h1 className="text-xl font-semibold">FieldTrack</h1>
            </div>
          </div>
          <Link href="/admin/login" className="rounded-full border border-navy/15 bg-white/70 px-4 py-2 text-sm font-medium text-navy backdrop-blur">
            Admin login
          </Link>
        </header>

        <section className="mt-10 grid flex-1 items-center gap-10 md:grid-cols-2">
          <div className="space-y-5">
            <p className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal">
              Face-secure attendance
            </p>
            <h2 className="text-4xl font-semibold leading-tight md:text-5xl">
              Punch in with your face.
              <span className="block text-teal">Leave a travel footprint.</span>
            </h2>
            <p className="max-w-md text-navy/70">
              Sector incharges sign in with mobile OTP. Daily punch-in and punch-out are locked to the registered face, and the route between them is mapped for you and admin.
            </p>
          </div>

          <div className="rounded-[2rem] bg-white p-6 shadow-float md:p-8">
            <h3 className="text-lg font-semibold">User login</h3>
            <p className="mt-1 text-sm text-navy/60">Use the mobile number registered by admin.</p>
            {step === "phone" ? (
              <form onSubmit={requestOtp} className="mt-6 space-y-4">
                <label className="block text-sm font-medium">Mobile number</label>
                <input
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10-digit number"
                  className="w-full rounded-2xl border border-navy/10 bg-sand/50 px-4 py-3 outline-none focus:border-teal"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button disabled={busy || phone.length !== 10} className="w-full rounded-2xl bg-ink py-3 font-semibold text-white disabled:opacity-40">
                  {busy ? "Sending OTP…" : "Send 4-digit OTP"}
                </button>
              </form>
            ) : (
              <form onSubmit={verify} className="mt-6 space-y-4">
                <p className="text-sm text-navy/60">OTP sent to +91 {phone}</p>
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="••••"
                  className="w-full rounded-2xl border border-navy/10 bg-sand/50 px-4 py-3 text-center text-2xl tracking-[0.6em] outline-none focus:border-teal"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button disabled={busy || otp.length !== 4} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white disabled:opacity-40">
                  {busy ? "Verifying…" : "Verify & continue"}
                </button>
                <button type="button" onClick={() => setStep("phone")} className="w-full text-sm text-navy/60">
                  Change number
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
