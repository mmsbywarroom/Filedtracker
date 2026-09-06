"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { LangToggle, useLang } from "@/lib/i18n";

/** Pages only Super Admin may open (nav + client redirect). APIs also enforce requireSuperAdmin. */
const SUPER_ONLY = [
  "/admin/create",
  "/admin/admins",
  "/admin/holidays",
  "/admin/salary-register",
  "/admin/rally-users",
  "/admin/rally-live",
  "/admin/rally-summary",
  "/admin/gps-off",
  "/admin/location-permissions",
  "/admin/location-security",
  "/admin/security-violations",
  "/admin/auto-punch-out",
  "/admin/face-reset-logs",
  "/admin/otp-logs",
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isSuper, setIsSuper] = useState(false);
  const [canSeeCallCenter, setCanSeeCallCenter] = useState(false);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        const superAdmin = Boolean(d.admin?.isSuper);
        const callCenter = Boolean(d.admin?.canSeeCallCenter);
        setIsSuper(superAdmin);
        setCanSeeCallCenter(callCenter);
        if (!superAdmin && SUPER_ONLY.some((p) => pathname.startsWith(p))) {
          window.location.replace("/admin");
        } else if (!callCenter && pathname.startsWith("/admin/call-center")) {
          window.location.replace("/admin");
        }
      })
      .catch(() => {});
  }, [pathname]);

  const nav = [
    { href: "/admin", label: t("dashboard"), match: (p: string) => p === "/admin", group: "Overview" },
    ...(canSeeCallCenter
      ? [
          {
            href: "/admin/call-center",
            label: t("callCenterDashboard"),
            match: (p: string) => p.startsWith("/admin/call-center"),
            group: "Overview",
          },
        ]
      : []),
    { href: "/admin/users", label: t("users"), match: (p: string) => p.startsWith("/admin/users"), group: "People" },
    ...(isSuper
      ? [{ href: "/admin/create", label: t("createUser"), match: (p: string) => p.startsWith("/admin/create"), group: "People" }]
      : []),
    ...(isSuper
      ? [{ href: "/admin/admins", label: t("admins"), match: (p: string) => p.startsWith("/admin/admins"), group: "People" }]
      : []),
    {
      href: "/admin/attendance",
      label: t("attendanceModule"),
      match: (p: string) => p.startsWith("/admin/attendance"),
      group: "Attendance",
    },
    { href: "/admin/records", label: t("dailyRecords"), match: (p: string) => p.startsWith("/admin/records"), group: "Attendance" },
    { href: "/admin/leaves", label: t("leaveModule"), match: (p: string) => p.startsWith("/admin/leaves"), group: "Attendance" },
    ...(isSuper
      ? [
          {
            href: "/admin/holidays",
            label: t("holidays"),
            match: (p: string) => p.startsWith("/admin/holidays"),
            group: "Attendance",
          },
          {
            href: "/admin/salary-register",
            label: t("salaryRegister"),
            match: (p: string) => p.startsWith("/admin/salary-register"),
            group: "Attendance",
          },
        ]
      : []),
    ...(isSuper
      ? [
          {
            href: "/admin/rally-users",
            label: t("rallyUsers"),
            match: (p: string) => p.startsWith("/admin/rally-users"),
            group: "Rally",
          },
          {
            href: "/admin/rally-live",
            label: t("rallyLive"),
            match: (p: string) => p.startsWith("/admin/rally-live"),
            group: "Rally",
          },
          {
            href: "/admin/rally-summary",
            label: t("rallySummary"),
            match: (p: string) => p.startsWith("/admin/rally-summary"),
            group: "Rally",
          },
        ]
      : []),
    ...(isSuper
      ? [
          {
            href: "/admin/gps-off",
            label: t("gpsOffLogs"),
            match: (p: string) => p.startsWith("/admin/gps-off"),
            group: "Logs",
          },
          {
            href: "/admin/location-permissions",
            label: "Always location",
            match: (p: string) => p.startsWith("/admin/location-permissions"),
            group: "Logs",
          },
          {
            href: "/admin/location-security",
            label: "Fake GPS (mock)",
            match: (p: string) => p.startsWith("/admin/location-security"),
            group: "Logs",
          },
          {
            href: "/admin/security-violations",
            label: t("securityViolationLogs"),
            match: (p: string) => p.startsWith("/admin/security-violations"),
            group: "Logs",
          },
          {
            href: "/admin/auto-punch-out",
            label: t("autoPunchOutLogs"),
            match: (p: string) => p.startsWith("/admin/auto-punch-out"),
            group: "Logs",
          },
          {
            href: "/admin/face-reset-logs",
            label: t("faceResetLogs"),
            match: (p: string) => p.startsWith("/admin/face-reset-logs"),
            group: "Logs",
          },
          {
            href: "/admin/otp-logs",
            label: "OTP request logs",
            match: (p: string) => p.startsWith("/admin/otp-logs"),
            group: "Logs",
          },
        ]
      : []),
  ];

  const groups = ["Overview", "People", "Attendance", "Rally", "Logs"] as const;

  async function logout() {
    await fetch("/api/auth/logout?scope=admin", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <div className="admin-app md:flex">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 bg-ink px-4 py-3 text-white md:hidden">
        <div className="flex items-center gap-2.5">
          <BrandMark size={40} tone="onDark" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-bright">{t("aap")}</p>
            <p className="text-sm font-semibold leading-tight">{t("app")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LangToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium"
          >
            {t("menu")}
          </button>
        </div>
      </header>

      <aside
        className={`${open ? "flex" : "hidden"} z-40 w-full flex-col overflow-y-auto border-r border-white/10 bg-ink text-white md:fixed md:inset-y-0 md:left-0 md:flex md:h-screen md:w-64 md:shrink-0`}
      >
        <div className="hidden border-b border-white/10 px-5 py-6 md:block">
          <Link href="/admin" onClick={() => setOpen(false)} className="block overflow-hidden">
            <BrandMark size={40} tone="onDark" className="max-w-full" />
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-bright">{t("aap")}</p>
            <h1 className="mt-1 truncate text-lg font-semibold leading-tight tracking-tight">{t("app")}</h1>
            <p className="mt-1 text-xs text-white/50">Admin console</p>
          </Link>
          <div className="mt-4">
            <LangToggle />
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 p-3 pb-6">
          {groups.map((group) => {
            const items = nav.filter((n) => n.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{group}</p>
                <div className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    const active = item.match(pathname);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={`relative rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                          active
                            ? "bg-white/12 text-white shadow-sm ring-1 ring-white/10"
                            : "text-white/65 hover:bg-white/8 hover:text-white"
                        }`}
                      >
                        {active && (
                          <span className="absolute inset-y-2 left-0 w-1 rounded-full bg-teal-bright" aria-hidden />
                        )}
                        <span className={active ? "pl-2" : ""}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            {t("logout")}
          </button>
        </div>
      </aside>

      <div className="min-h-screen min-w-0 flex-1 md:pl-64">{children}</div>
    </div>
  );
}
