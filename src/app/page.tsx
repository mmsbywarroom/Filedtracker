"use client";

import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useLang } from "@/lib/i18n";
import { isPureNativeApp, saveNativeSession } from "@/lib/pureNativeApp";

export default function HomePage() {
  const { t } = useLang();
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
    if (isPureNativeApp() && data.token) {
      saveNativeSession(
        String(data.token),
        String(data.apiBaseUrl || window.location.origin),
        phone
      );
    }
    window.location.href = data.kind === "rally" ? "/rally" : "/dashboard";
  }

  return (
    <main className="native-safe-bottom flex min-h-screen flex-col bg-sand">
      <header className="app-header-safe bg-ink text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <BrandMark size={56} tone="onDark" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-bright">{t("aap")}</p>
              <h1 className="text-lg font-semibold">{t("app")}</h1>
            </div>
          </div>
          <LangToggle />
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-float md:p-8">
          <BrandMark size={88} className="mb-4" />
          <p className="inline-flex rounded-full bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal">
            {t("faceBadge")}
          </p>
          <h3 className="mt-4 text-xl font-semibold">{t("login")}</h3>
          <p className="mt-1 text-sm text-navy/60">{t("loginHint")}</p>
          {step === "phone" ? (
            <form onSubmit={requestOtp} className="mt-6 space-y-4">
              <label className="block text-sm font-medium">{t("mobile")}</label>
              <input
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder={t("mobilePh")}
                className="w-full rounded-2xl border border-navy/10 bg-sand/50 px-4 py-3 text-base outline-none focus:border-teal"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button disabled={busy || phone.length !== 10} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white disabled:opacity-40">
                {busy ? t("sending") : t("sendOtp")}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <p className="text-sm text-navy/60">{t("otpSent")} {phone}</p>
              <input
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="w-full rounded-2xl border border-navy/10 bg-sand/50 px-4 py-3 text-center text-2xl tracking-[0.6em] outline-none focus:border-teal"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button disabled={busy || otp.length !== 6} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white disabled:opacity-40">
                {busy ? t("verifying") : t("verify")}
              </button>
              <button type="button" onClick={() => setStep("phone")} className="w-full text-sm text-navy/60">
                {t("changeNumber")}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
