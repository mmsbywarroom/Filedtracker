/** Host helpers for filed vs rally public sites. */

export function hostnameFromHostHeader(host: string | null | undefined): string {
  return String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

/** True for rally.videh.co.in (and www). */
export function isRallyPublicHost(host: string | null | undefined): boolean {
  const h = hostnameFromHostHeader(host);
  return h === "rally.videh.co.in" || h === "www.rally.videh.co.in";
}

/** Browser-side: rally subdomain or local ?rally=1 for testing. */
export function isRallyWebEntry(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  if (h === "rally.videh.co.in" || h === "www.rally.videh.co.in") return true;
  if (h === "localhost" || h === "127.0.0.1") {
    return new URLSearchParams(window.location.search).get("rally") === "1";
  }
  return false;
}
