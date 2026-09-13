-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deactivatedAt" TIMESTAMP(3);

-- Backfill: existing inactive users get a deactivation timestamp (best-effort from updatedAt)
UPDATE "User"
SET "deactivatedAt" = "updatedAt"
WHERE "isActive" = false AND "deactivatedAt" IS NULL;
