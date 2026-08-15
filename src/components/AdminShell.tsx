"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";

const nav = [
  { href: "/admin", label: "Users", match: (p: string) => p === "/admin" || p.startsWith("/admin/users") },
  { href: "/admin/create", label: "Create user", match: (p: string) => p.startsWith("/admin/create") },
  { href: "/admin/records", label: "Daily records", match: (p: string) => p.startsWith("/admin/records") },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-sand md:grid md:grid-cols-[240px_1fr]">
      <header className="flex items-center justify-between border-b border-navy/10 bg-ink px-4 py-3 text-white md:hidden">
        <p className="font-semibold">FieldTrack Admin</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-white/20 px-3 py-1 text-sm">
          Menu
        </button>
      </header>

      <aside
        className={`${open ? "block" : "hidden"} bg-ink text-white md:flex md:min-h-screen md:flex-col`}
      >
        <div className="hidden border-b border-white/10 px-5 py-6 md:block">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-bright">Admin</p>
          <h1 className="mt-1 text-lg font-semibold">FieldTrack</h1>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium ${
                  active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-4">
          <button type="button" onClick={logout} className="w-full rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70">
            Logout
          </button>
        </div>
      </aside>

      <div className="min-h-screen">{children}</div>
    </div>
  );
}
