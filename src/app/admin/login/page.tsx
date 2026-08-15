"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function AdminLoginPage() {
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal">Admin</p>
        <h1 className="mt-2 text-2xl font-semibold">Command access</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-navy/10 bg-sand/40 px-4 py-3"
            placeholder="Email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-navy/10 bg-sand/40 px-4 py-3"
            placeholder="Password"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={busy} className="w-full rounded-2xl bg-ink py-3 font-semibold text-white">
            {busy ? "Signing in…" : "Enter admin"}
          </button>
        </form>
        <Link href="/" className="mt-6 block text-center text-sm text-navy/50">
          Back to user login
        </Link>
      </div>
    </main>
  );
}
