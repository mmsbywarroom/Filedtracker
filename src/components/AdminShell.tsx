"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useLang } from "@/lib/i18n";

const SUPER_ONLY = ["/admin/records", "/admin/admins"];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [canCreateUsers, setCanCreateUsers] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        const superAdmin = Boolean(d.admin?.isSuper);
        const createUsers = Boolean(d.admin?.canCreateUsers);
        setIsSuper(superAdmin);
        setCanCreateUsers(createUsers);
        if (!superAdmin && SUPER_ONLY.some((p) => pathname.startsWith(p))) {
          window.location.replace("/admin");
        } else if (!superAdmin && !createUsers && pathname.startsWith("/admin/create")) {
          window.location.replace("/admin");
        }
      })
      .catch(() => {});
  }, [pathname]);

  const nav = [
    { href: "/admin", label: t("dashboard"), match: (p: string) => p === "/admin" },
    { href: "/admin/users", label: t("users"), match: (p: string) => p.startsWith("/admin/users") },
    { href: "/admin/gps-off", label: t("gpsOffLogs"), match: (p: string) => p.startsWith("/admin/gps-off") },
    {
      href: "/admin/auto-punch-out",
      label: t("autoPunchOutLogs"),
      match: (p: string) => p.startsWith("/admin/auto-punch-out"),
    },
    { href: "/admin/leaves", label: t("leaveModule"), match: (p: string) => p.startsWith("/admin/leaves") },
    { href: "/admin/attendance", label: t("attendanceModule"), match: (p: string) => p.startsWith("/admin/attendance") },
    ...((isSuper || canCreateUsers)
      ? [{ href: "/admin/create", label: t("createUser"), match: (p: string) => p.startsWith("/admin/create") }]
      : []),
    ...(isSuper
      ? [
          { href: "/admin/records", label: t("dailyRecords"), match: (p: string) => p.startsWith("/admin/records") },
          { href: "/admin/admins", label: t("admins"), match: (p: string) => p.startsWith("/admin/admins") },
        ]
      : []),
  ];

  async function logout() {
    await fetch("/api/auth/logout?scope=admin", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb] md:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-ink px-4 py-3 text-white md:hidden">
        <div className="flex items-center gap-2">
          <BrandMark size={40} tone="onDark" />
          <p className="font-semibold">{t("app")}</p>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle />
          <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg border border-white/20 px-3 py-1 text-sm">
            {t("menu")}
          </button>
        </div>
      </header>

      <aside
        className={`${open ? "flex" : "hidden"} z-40 w-full flex-col overflow-y-auto bg-ink text-white md:fixed md:inset-y-0 md:left-0 md:flex md:h-screen md:w-60 md:shrink-0`}
      >
        <div className="hidden border-b border-white/10 px-4 py-5 md:block">
          <Link href="/admin" onClick={() => setOpen(false)} className="block overflow-hidden">
            <BrandMark size={36} tone="onDark" className="max-w-full" />
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-teal-bright">{t("aap")}</p>
            <h1 className="mt-1 truncate text-base font-semibold leading-tight">{t("app")}</h1>
            <p className="mt-0.5 text-xs text-white/55">Admin</p>
          </Link>
          <div className="mt-3">
            <LangToggle />
          </div>
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
            {t("logout")}
          </button>
        </div>
      </aside>

      <div className="min-h-screen min-w-0 flex-1 md:pl-60">{children}</div>
    </div>
  );
}
