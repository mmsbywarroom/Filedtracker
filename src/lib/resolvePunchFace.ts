import { describeFaceFromImage } from "@/lib/faceDescribeServer";
import { requireUserFaceMatch } from "@/lib/requireFaceMatch";

/**
 * Match registered face for punch in/out.
 * Prefers a client descriptor when present (web); otherwise describes the photo once on the server (native).
 */
export async function resolveAndMatchPunchFace(
  userId: string,
  descriptor: unknown,
  image: unknown
) {
  let live: number[] | null = Array.isArray(descriptor) ? (descriptor as number[]) : null;
  if (!live || live.length < 64) {
    if (typeof image !== "string" || !image.trim()) {
      return { ok: false as const, error: "Face photo is required for punch." };
    }
    const described = await describeFaceFromImage(image, { relaxed: true, fast: true });
    if (!described.ok) return { ok: false as const, error: described.error };
    live = described.descriptor;
  }
  return requireUserFaceMatch(userId, live);
}
