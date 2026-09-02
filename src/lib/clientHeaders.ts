import { isPureNativeApp } from "@/lib/pureNativeApp";

export type ClientSourceHeader = "web" | "capacitor" | "native";

export function clientSource(): ClientSourceHeader {
  if (typeof window === "undefined") return "web";
  if (isPureNativeApp()) return "native";
  return "web";
}

export function withClientHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("X-Client-Source", clientSource());
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return { ...init, headers };
}

export function apiFetch(input: string, init?: RequestInit) {
  return fetch(input, withClientHeaders(init));
}
