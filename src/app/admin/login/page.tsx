"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { LangToggle, useLang } from "@/lib/i18n";

export default function AdminLoginPage() {
  const { t } = useLang();
  const [email, setEmail] = useState("admin@fieldtrack.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Login failed");
      return;
    }
    window.location.href = "/admin";
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4">
      <div className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-float">
        <div className="mb-4 flex justify-end">
          <LangToggle tone="light" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal">{t("aap")}</p>
        <h1 className="mt-2 text-2xl font-semibold">{t("adminLogin")}</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-navy/10 bg-sand/40 px-4 py-3"
            placeholder={t("email")}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-navy/10 bg-sand/40 px-4 py-3"
            placeholder={t("password")}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={busy} className="w-full rounded-2xl bg-teal py-3 font-semibold text-white">
            {busy ? t("signingIn") : t("enterAdmin")}
          </button>
        </form>
        <Link href="/" className="mt-6 block text-center text-sm text-navy/50">
          {t("backUser")}
        </Link>
      </div>
    </main>
  );
}
