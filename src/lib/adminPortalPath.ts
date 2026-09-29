"use client";

import { usePathname } from "next/navigation";

/** Rewrites /admin links when the same screens are open inside the calling portal. */
export function useAdminPortal() {
  const pathname = usePathname() || "";
  const call = pathname.startsWith("/call/admin");
  return {
    call,
    loginHref: call ? "/call/admin/login" : "/admin/login",
    href(path: string) {
      if (!call) return path;
      return path.replace(/^\/admin(?=\/|\?|$)/, "/call/admin");
    },
  };
}
