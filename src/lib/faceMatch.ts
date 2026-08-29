/** Server-side face descriptor matching (no face-api / browser deps). */

export function euclidean(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 99;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export function parseStoredDescriptors(raw: string): number[][] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === "number") {
      return [parsed as number[]];
    }
    if (Array.isArray(parsed) && parsed.length && Array.isArray(parsed[0])) {
      return (parsed as number[][]).filter((d) => Array.isArray(d) && d.length >= 64);
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * face-api FaceMatcher default is 0.6.
 * Lower = stricter (harder for another person to match).
 * Same person usually ~0.3–0.45; different people often >0.55.
 */
export const FACE_MATCH_THRESHOLD = 0.5;

export type FaceMatchResult =
  | { ok: true; distance: number }
  | { ok: false; distance: number; error: string };

export function matchFaceDescriptor(
  storedList: number[][],
  live: number[]
): FaceMatchResult {
  if (!Array.isArray(live) || live.length < 64) {
    return { ok: false, distance: 99, error: "Face not detected." };
  }
  if (!storedList.length) {
    return { ok: false, distance: 99, error: "Register your face again." };
  }

  const distances = storedList.map((stored) => euclidean(stored, live));
  const best = Math.min(...distances);

  // Must beat strict threshold against at least one enrollment sample
  if (best >= FACE_MATCH_THRESHOLD) {
    return {
      ok: false,
      distance: best,
      error:
        "Face did not match. Only your registered face can punch. Use bright light, look straight, or ask admin to reset face.",
    };
  }

  // If multiple samples stored, majority must be reasonably close (blocks lucky one-sample spoof)
  if (distances.length >= 2) {
    const closeEnough = distances.filter((d) => d < FACE_MATCH_THRESHOLD + 0.06).length;
    if (closeEnough < Math.ceil(distances.length / 2)) {
      return {
        ok: false,
        distance: best,
        error:
          "Face did not match clearly. Hold the phone steady with your own face centered, then try again.",
      };
    }
  }

  return { ok: true, distance: best };
}
