export function sanitizeFaceImage(raw: unknown) {
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("data:image/jpeg;base64,")) return null;
  if (raw.length < 80 || raw.length > 220000) return null;
  return raw;
}
