-- AlterTable
ALTER TABLE "RallyCheckin" ADD COLUMN IF NOT EXISTS "lastLat" DOUBLE PRECISION;
ALTER TABLE "RallyCheckin" ADD COLUMN IF NOT EXISTS "lastLng" DOUBLE PRECISION;
ALTER TABLE "RallyCheckin" ADD COLUMN IF NOT EXISTS "lastFixAt" TIMESTAMP(3);
ALTER TABLE "RallyCheckin" ADD COLUMN IF NOT EXISTS "movedMeters" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "RallyCheckin"
SET "lastLat" = "lat",
    "lastLng" = "lng",
    "lastFixAt" = "startedAt"
WHERE "lastLat" IS NULL;
