ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "dlcDecision" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "clusterDecision" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "dlcReviewedAt" TIMESTAMP(3);
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "clusterReviewedAt" TIMESTAMP(3);
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "dlcReviewedById" TEXT;
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "clusterReviewedById" TEXT;
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "dlcReviewedByName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "clusterReviewedByName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "dlcNote" TEXT;
ALTER TABLE "AttendanceChangeRequest" ADD COLUMN IF NOT EXISTS "clusterNote" TEXT;

CREATE TABLE IF NOT EXISTS "AttendanceDirectChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL DEFAULT '',
    "changedByEmail" TEXT NOT NULL DEFAULT '',
    "changedByLevel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceDirectChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AttendanceDirectChange_changedByLevel_createdAt_idx" ON "AttendanceDirectChange"("changedByLevel", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceDirectChange_date_createdAt_idx" ON "AttendanceDirectChange"("date", "createdAt");
CREATE INDEX IF NOT EXISTS "AttendanceDirectChange_userId_date_idx" ON "AttendanceDirectChange"("userId", "date");

DO $$ BEGIN
  ALTER TABLE "AttendanceDirectChange" ADD CONSTRAINT "AttendanceDirectChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
