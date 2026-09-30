"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";

const NAV = [
  { href: "/call/admin", label: "Call list", group: "Calling" },
  { href: "/call/admin/summary", label: "Summary", group: "Calling" },
  { href: "/call/admin/submissions", label: "Call submissions", group: "Calling" },
  { href: "/call/admin/form", label: "Form designer", group: "Calling" },
  { href: "/call/admin/users", label: "Users", group: "People" },
  { href: "/call/admin/attendance", label: "Attendance", group: "Attendance" },
  { href: "/call/admin/records", label: "Daily records", group: "Attendance" },
];

export function CallAdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/call/admin/session", { method: "DELETE" });
    window.location.href = "/call/admin/login";
  }

  function active(href: string) {
    if (href === "/call/admin") return pathname === "/call/admin";
    return pathname.startsWith(href);
  }

  const groups = ["Calling", "People", "Attendance"];

  return (
    <div className="min-h-screen bg-[#f4f7fb] md:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#0A1628] px-4 py-3 text-white md:hidden">
        <p className="text-sm font-semibold">Calling portal</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-white/20 px-3 py-1 text-sm">
          Menu
        </button>
      </header>
      <aside className={`${open ? "flex" : "hidden"} z-40 w-full flex-col bg-[#0A1628] text-white md:fixed md:inset-y-0 md:flex md:w-64`}>
        <div className="border-b border-white/10 px-5 py-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">Aam Aadmi Party</p>
          <h1 className="mt-1 text-lg font-semibold">Calling portal</h1>
          <p className="mt-1 text-xs text-white/50">Call center admin</p>
        </div>
        <nav className="flex flex-1 flex-col gap-5 p-3">
          {groups.map((group) => (
            <div key={group}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{group}</p>
              {NAV.filter((item) => item.group === group).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`block rounded-xl px-3 py-2.5 text-sm font-medium ${
                    active(item.href) ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <button type="button" onClick={logout} className="w-full rounded-xl border border-white/15 px-3 py-2.5 text-sm font-semibold text-white/80">
            Logout
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1 md:pl-64">{children}</div>
    </div>
  );
}
