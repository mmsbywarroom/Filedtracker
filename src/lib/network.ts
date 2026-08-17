export function isSlowNetwork() {
  if (typeof navigator === "undefined") return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return false;
  return Boolean(c.saveData) || /2g|slow-2g|3g/i.test(c.effectiveType || "");
}

export function jpegSize() {
  return isSlowNetwork() ? 160 : 200;
}

export function jpegQuality() {
  return isSlowNetwork() ? 0.5 : 0.62;
}
