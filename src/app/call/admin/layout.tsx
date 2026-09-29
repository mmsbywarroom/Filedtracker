"use client";

import { usePathname } from "next/navigation";
import { CallAdminShell } from "@/components/CallAdminShell";

export default function CallAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/call/admin/login") return <>{children}</>;
  return <CallAdminShell>{children}</CallAdminShell>;
}
