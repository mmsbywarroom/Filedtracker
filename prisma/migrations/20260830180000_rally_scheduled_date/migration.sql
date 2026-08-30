-- AlterTable
ALTER TABLE "Rally" ADD COLUMN "scheduledDate" DATE;

UPDATE "Rally"
SET "scheduledDate" = (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date
WHERE "scheduledDate" IS NULL;

ALTER TABLE "Rally" ALTER COLUMN "scheduledDate" SET NOT NULL;

CREATE INDEX "Rally_scheduledDate_idx" ON "Rally"("scheduledDate");
CREATE INDEX "Rally_isActive_idx" ON "Rally"("isActive");
