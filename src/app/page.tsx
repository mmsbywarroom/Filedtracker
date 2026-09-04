"use client";

import { FormEvent, useEffect, useState } from "react";
import { ApkDownloadLanding } from "@/components/ApkDownloadLanding";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useLang } from "@/lib/i18n";
import { isAndroidBrowser, isIosBrowser } from "@/lib/clientDevice";
import { isPureNativeApp, saveNativeSession } from "@/lib/pureNativeApp";

/**
 * - Pure native WebView: OTP login
 * - Phone browsers (Android + Safari): download landing (APK + TestFlight)
 * - Desktop: same download landing (?staff=1 for web login escape)
 */
export default function HomePage() {
  const { t } = useLang();
  const [mode, setMode] = useState<"loading" | "native-login" | "download">("loading");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (isPureNativeApp()) {
      setMode("native-login");
      return;
    }
    const staff = new URLSearchParams(window.location.search).get("staff") === "1";
    // Desktop staff escape only — never phone browser web punch.
    if (staff && !isAndroidBrowser() && !isIosBrowser()) {
      setMode("native-login");
      return;
    }
    setMode("download");
  }, []);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setTimeout(() => setCooldownSec((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldownSec]);

  async function sendOtpRequest() {
    if (busy || cooldownSec > 0 || phone.length !== 10) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not send OTP");
        if (res.status === 429) setCooldownSec(45);
        return;
      }
      setStep("otp");
      setCooldownSec(45);
    } catch {
      setError("Could not send OTP. Check network and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp(e: FormEvent) {
    e.preventDefault();
    await sendOtpRequest();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy || otp.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
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
    } catch {
      setError("Could not verify OTP. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink text-white/50">
        <BrandMark size={64} tone="onDark" />
      </main>
    );
  }

  if (mode === "download") {
    return <ApkDownloadLanding />;
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
            <form onSubmit={requestOtp} className="mt-6 space-y-4" autoComplete="on">
              <label className="block text-sm font-medium">{t("mobile")}</label>
              <input
                inputMode="numeric"
                maxLength={10}
                name="phone"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder={t("mobilePh")}
                className="w-full rounded-2xl border border-navy/10 bg-sand/50 px-4 py-3 text-base outline-none focus:border-teal"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={busy || phone.length !== 10 || cooldownSec > 0}
                className="w-full rounded-2xl bg-teal py-3 font-semibold text-white disabled:opacity-40"
              >
                {busy
                  ? t("sending")
                  : cooldownSec > 0
                    ? `Wait ${cooldownSec}s`
                    : t("sendOtp")}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="mt-6 space-y-4">
              <p className="text-sm text-navy/60">
                {t("otpSent")} {phone}
              </p>
              <input
                inputMode="numeric"
                maxLength={6}
                name="otp"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="w-full rounded-2xl border border-navy/10 bg-sand/50 px-4 py-3 text-center text-2xl tracking-[0.6em] outline-none focus:border-teal"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={busy || otp.length !== 6}
                className="w-full rounded-2xl bg-teal py-3 font-semibold text-white disabled:opacity-40"
              >
                {busy ? t("verifying") : t("verify")}
              </button>
              <button
                type="button"
                disabled={busy || cooldownSec > 0}
                onClick={() => void sendOtpRequest()}
                className="w-full text-sm text-navy/60 disabled:opacity-40"
              >
                {cooldownSec > 0 ? `Resend OTP in ${cooldownSec}s` : "Resend OTP"}
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
