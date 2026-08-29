import { prisma } from "@/lib/prisma";
import { matchFaceDescriptor, parseStoredDescriptors } from "@/lib/faceMatch";

/** Require live face descriptor to match this user's registered face (punch in/out). */
export async function requireUserFaceMatch(userId: string, descriptor: unknown) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { faceDescriptorJson: true, faceRegisteredAt: true },
  });
  if (!user?.faceDescriptorJson || !user.faceRegisteredAt) {
    return { ok: false as const, error: "Register your face first." };
  }
  const stored = parseStoredDescriptors(user.faceDescriptorJson);
  const live = Array.isArray(descriptor) ? (descriptor as number[]) : [];
  const result = matchFaceDescriptor(stored, live);
  if (!result.ok) return { ok: false as const, error: result.error, distance: result.distance };
  return { ok: true as const, distance: result.distance };
}
