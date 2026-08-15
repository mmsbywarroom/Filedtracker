"use client";

export function logoutAndGo(to: string) {
  return async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = to;
  };
}
