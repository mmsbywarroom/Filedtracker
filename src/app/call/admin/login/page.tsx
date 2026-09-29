"use client";

import { FormEvent, useState } from "react";

export default function CallAdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/call/admin/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error || "Could not sign in.");
      return;
    }
    window.location.href = "/call/admin";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A1628] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6">
        <h1 className="text-xl font-semibold">Calling portal admin</h1>
        <p className="mt-1 text-sm text-slate-500">Call list, callers, and the calling form live here.</p>
        <label className="mt-4 block text-sm font-medium">
          User ID
          <input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3" />
        </label>
        {msg ? <p className="mt-3 text-sm text-red-700">{msg}</p> : null}
        <button type="submit" disabled={busy} className="mt-4 h-11 w-full rounded-xl bg-[#0A1628] font-semibold text-white disabled:opacity-50">
          Login
        </button>
      </form>
    </main>
  );
}
