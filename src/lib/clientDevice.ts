/** Client-only device helpers (call after mount). */

export function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Pure native WebView must keep login — do not treat as browser.
  if (ua.includes("AAPNative/")) return false;
  return /Android/i.test(ua);
}

export function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (ua.includes("AAPNative/")) return false;
  return /iPhone|iPad|iPod/i.test(ua);
}
