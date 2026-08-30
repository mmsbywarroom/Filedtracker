export function sanitizeRallyPhoto(raw: unknown) {
  if (typeof raw !== "string") return null;
  const ok =
    raw.startsWith("data:image/jpeg;base64,") ||
    raw.startsWith("data:image/png;base64,") ||
    raw.startsWith("data:image/webp;base64,");
  if (!ok) return null;
  if (raw.length < 80 || raw.length > 1_800_000) return null;
  return raw;
}
