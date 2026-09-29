/** Host helpers for call.aappunjab.in. */

export function isCallPublicHost(host: string | null | undefined): boolean {
  const h = String(host || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
  return h === "call.aappunjab.in" || h === "www.call.aappunjab.in";
}
